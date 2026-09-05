import { NextResponse } from "next/server";
import {
  MentorAccessError,
  normalizeMentorShift,
  parseMentorTaskFilters,
  toMentorDailyTask,
  type MentorTaskRow,
} from "@/lib/mentorAccess";
import { loadTraineeScope } from "@/lib/mentorServer";
import { ApiAuthError, getRequestIdentity } from "@/lib/serverAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function apiError(error: unknown, fallback: string) {
  const status = error instanceof ApiAuthError || error instanceof MentorAccessError
    ? error.status
    : 500;
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status },
  );
}

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    const filters = parseMentorTaskFilters(new URL(request.url).searchParams);
    const traineeIds = await loadTraineeScope(identity, filters.traineeId);
    if (!traineeIds.length) {
      return NextResponse.json(
        { tasks: [], trainees: [], filters, readOnly: true },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const admin = getSupabaseAdmin();
    let taskQuery = admin
      .from("tasks")
      .select("id,title,description,owner_id,task_date,deadline,status,shift,proof_url,updated_at,kind,raw_payload")
      .in("owner_id", traineeIds)
      .is("deleted_at", null)
      .gte("task_date", filters.from)
      .lte("task_date", filters.to);
    if (filters.status) taskQuery = taskQuery.eq("status", filters.status);

    const [{ data: tasks, error: taskError }, { data: profiles, error: profileError }] = await Promise.all([
      taskQuery.order("task_date", { ascending: true }).order("updated_at", { ascending: false }),
      admin
        .from("profiles")
        .select("id,full_name,email,status")
        .in("id", traineeIds)
        .eq("status", "active")
        .order("full_name", { ascending: true }),
    ]);
    if (taskError) throw taskError;
    if (profileError) throw profileError;

    const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
    const normalizedTasks = (tasks ?? [])
      .map((row) => toMentorDailyTask(row as MentorTaskRow, names.get(row.owner_id) ?? "Trainee"))
      .filter((task) => !filters.shift || normalizeMentorShift(task.shift) === filters.shift)
      .sort((left, right) => (
        left.date.localeCompare(right.date)
        || ["morning", "afternoon", "unassigned"].indexOf(left.shift)
          - ["morning", "afternoon", "unassigned"].indexOf(right.shift)
        || left.title.localeCompare(right.title, "vi")
      ));

    return NextResponse.json({
      tasks: normalizedTasks,
      trainees: (profiles ?? []).map((profile) => ({
        id: profile.id,
        fullName: profile.full_name,
        email: profile.email,
      })),
      filters,
      readOnly: true,
      total: normalizedTasks.length,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error, "Không thể tải task daily của Trainee.");
  }
}
