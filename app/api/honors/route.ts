import { NextResponse } from "next/server";
import { isUuid } from "@/lib/documents";
import {
  buildHonorRankings,
  HONOR_FORMULA_VERSION,
  HonorValidationError,
  resolveHonorPeriod,
  type HonorTask,
} from "@/lib/honors";
import {
  buildHonorExternalMetricsFromState,
  loadDashboardHonorState,
  unavailableHonorSourceBundle,
} from "@/lib/honorSources";
import { ApiAuthError, getRequestIdentity } from "@/lib/serverAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function apiError(error: unknown, fallback: string) {
  const status = error instanceof ApiAuthError || error instanceof HonorValidationError
    ? error.status
    : 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message || fallback }, { status });
}

export async function GET(request: Request) {
  try {
    await getRequestIdentity(request);
    const url = new URL(request.url);
    const period = resolveHonorPeriod({
      periodType: url.searchParams.get("periodType"),
      start: url.searchParams.get("start"),
      end: url.searchParams.get("end"),
    });
    const userId = url.searchParams.get("userId")?.trim() || null;
    const detailsUserId = url.searchParams.get("detailsUserId")?.trim() || null;
    if (userId && !isUuid(userId)) throw new HonorValidationError("Mã nhân sự không hợp lệ.");
    if (detailsUserId && !isUuid(detailsUserId)) throw new HonorValidationError("Mã nhân sự cần đối chiếu không hợp lệ.");
    if (userId && detailsUserId && userId !== detailsUserId) {
      throw new HonorValidationError("Nhân sự lọc và nhân sự đối chiếu phải trùng nhau.");
    }
    const taskPeriodFilter = [
      `and(task_date.gte.${period.start},task_date.lte.${period.end})`,
      `and(task_date.is.null,deadline.gte.${period.start},deadline.lte.${period.end})`,
      "and(task_date.is.null,deadline.is.null)",
    ].join(",");

    const admin = getSupabaseAdmin();
    const profileQuery = admin
      .from("profiles")
      .select("id,email,full_name")
      .eq("status", "active");
    const statePromise = loadDashboardHonorState(admin)
      .then((value) => ({ value, error: null as Error | null }))
      .catch((error: unknown) => ({
        value: null,
        error: error instanceof Error ? error : new Error("Không thể đọc dashboard state."),
      }));
    const [profileResult, taskResult, stateResult] = await Promise.all([
      profileQuery.order("full_name", { ascending: true }),
      admin
        .from("tasks")
        .select("id,title,owner_id,kind,status,task_date,deadline,completed_at,original_task_id,rescheduled_from_task_id,rescheduled_to_task_id,created_at,updated_at,deleted_at,raw_payload")
        .or(taskPeriodFilter)
        .order("task_date", { ascending: true, nullsFirst: false })
        .order("deadline", { ascending: true }),
      statePromise,
    ]);
    if (profileResult.error) throw profileResult.error;
    if (taskResult.error) throw taskResult.error;
    if ((userId || detailsUserId) && !(profileResult.data ?? []).some((profile) => profile.id === (userId || detailsUserId))) {
      if (detailsUserId && !userId) {
        const { data: detailProfile, error: detailError } = await admin
          .from("profiles")
          .select("id,email,full_name")
          .eq("status", "active")
          .eq("id", detailsUserId)
          .maybeSingle();
        if (detailError) throw detailError;
        if (!detailProfile) throw new ApiAuthError("Không tìm thấy nhân sự cần đối chiếu.", 404);
      } else {
        throw new ApiAuthError("Không tìm thấy nhân sự.", 404);
      }
    }

    const taskIds = (taskResult.data ?? []).map((task) => task.id);
    const collaborators = new Map<string, string[]>();
    if (taskIds.length) {
      const { data, error } = await admin
        .from("task_collaborators")
        .select("task_id,user_id")
        .in("task_id", taskIds);
      if (error) throw error;
      for (const row of data ?? []) {
        collaborators.set(row.task_id, [...(collaborators.get(row.task_id) ?? []), row.user_id]);
      }
    }

    const tasks: HonorTask[] = (taskResult.data ?? []).map((row) => {
      const raw = asRecord(row.raw_payload);
      return {
        id: row.id,
        title: row.title,
        ownerId: row.owner_id,
        collaboratorIds: collaborators.get(row.id) ?? [],
        kind: row.kind,
        status: row.status,
        deadline: row.deadline,
        taskDate: typeof row.task_date === "string"
          ? row.task_date
          : typeof raw.taskDate === "string"
          ? raw.taskDate
          : typeof raw.task_date === "string" ? raw.task_date : null,
        completedAt: row.completed_at,
        originalTaskId: row.original_task_id,
        rescheduledFromTaskId: row.rescheduled_from_task_id,
        rescheduledToTaskId: row.rescheduled_to_task_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
        rawPayload: raw,
      };
    });
    const allProfiles = (profileResult.data ?? []).map((profile) => ({
      id: profile.id,
      fullName: profile.full_name,
      email: profile.email,
    }));
    const profiles = userId
      ? allProfiles.filter((profile) => profile.id === userId)
      : allProfiles;
    const sourceBundle = stateResult.value
      ? buildHonorExternalMetricsFromState({
          state: stateResult.value.state,
          profiles: allProfiles,
          period,
          stateUpdatedAt: stateResult.value.updatedAt,
        })
      : unavailableHonorSourceBundle(
          stateResult.error?.message || "Không thể đọc dashboard state.",
        );
    const result = buildHonorRankings({
      profiles,
      tasks,
      period,
      detailsUserId,
      externalMetrics: sourceBundle.externalMetrics,
    });

    return NextResponse.json({
      period,
      formulaVersion: HONOR_FORMULA_VERSION,
      rankings: result.rankings,
      insufficient: result.insufficient,
      sources: {
        tasks: {
          status: "available",
          reason: "Task được đọc trực tiếp từ Supabase và lọc theo ngày trong kỳ.",
        },
        ...sourceBundle.sources,
      },
      generatedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error, "Không thể tính dữ liệu Vinh danh.");
  }
}
