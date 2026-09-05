import { NextResponse } from "next/server";
import { MENTOR_ROLE, TRAINEE_ROLE } from "@/lib/mentorAccess";
import { activeProfileHasRole, requireUuid } from "@/lib/mentorServer";
import { ApiAuthError, getRequestIdentity } from "@/lib/serverAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function apiError(error: unknown, fallback: string) {
  const status = error instanceof ApiAuthError
    ? error.status
    : error instanceof SyntaxError ? 400 : 500;
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status },
  );
}

function requireMentorReader(role: string) {
  if (role !== "Admin" && role !== MENTOR_ROLE) {
    throw new ApiAuthError("Chỉ Admin hoặc Mentor được xem danh sách Trainee.", 403);
  }
}

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    requireMentorReader(identity.activeRole);
    const url = new URL(request.url);
    const requestedMentorId = url.searchParams.get("mentorId");
    const mentorId = identity.activeRole === "Admin" && requestedMentorId
      ? requireUuid(requestedMentorId, "Mã Mentor")
      : identity.user.id;
    const admin = getSupabaseAdmin();

    const [{ data: traineeRoles, error: roleError }, { data: assignments, error: assignmentError }] = await Promise.all([
      admin.from("user_roles").select("user_id").eq("role", TRAINEE_ROLE),
      admin
        .from("mentor_trainees")
        .select("id,mentor_id,trainee_id,assigned_at")
        .eq("mentor_id", mentorId)
        .is("revoked_at", null),
    ]);
    if (roleError) throw roleError;
    if (assignmentError) throw assignmentError;

    const traineeRoleIds = new Set((traineeRoles ?? []).map((row) => row.user_id));
    const assignedByTrainee = new Map(
      (assignments ?? [])
        .filter((row) => traineeRoleIds.has(row.trainee_id))
        .map((row) => [row.trainee_id, row]),
    );
    const visibleIds = identity.activeRole === "Admin" && !requestedMentorId
      ? [...traineeRoleIds]
      : [...assignedByTrainee.keys()];
    if (!visibleIds.length) {
      return NextResponse.json(
        { trainees: [], mentorId, readOnly: true },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id,full_name,email,status")
      .in("id", visibleIds)
      .eq("status", "active")
      .order("full_name", { ascending: true });
    if (profileError) throw profileError;

    return NextResponse.json({
      mentorId,
      readOnly: true,
      trainees: (profiles ?? []).map((profile) => {
        const assignment = assignedByTrainee.get(profile.id);
        return {
          id: profile.id,
          fullName: profile.full_name,
          email: profile.email,
          assigned: Boolean(assignment),
          assignmentId: assignment?.id ?? null,
          assignedAt: assignment?.assigned_at ?? null,
        };
      }),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error, "Không thể tải danh sách Trainee.");
  }
}

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (identity.activeRole !== "Admin") {
      throw new ApiAuthError("Chỉ Admin được phân công Mentor–Trainee.", 403);
    }
    const body = await request.json() as Record<string, unknown>;
    const mentorId = requireUuid(body.mentorId, "Mã Mentor");
    const traineeId = requireUuid(body.traineeId, "Mã Trainee");
    if (mentorId === traineeId) throw new ApiAuthError("Mentor và Trainee phải là hai tài khoản khác nhau.", 400);

    const [mentorValid, traineeValid] = await Promise.all([
      activeProfileHasRole(mentorId, MENTOR_ROLE),
      activeProfileHasRole(traineeId, TRAINEE_ROLE),
    ]);
    if (!mentorValid) throw new ApiAuthError("Mentor phải là PR Leader đang hoạt động.", 400);
    if (!traineeValid) throw new ApiAuthError("Trainee phải là PR Representative đang hoạt động.", 400);

    const { data, error } = await getSupabaseAdmin()
      .from("mentor_trainees")
      .insert({ mentor_id: mentorId, trainee_id: traineeId, assigned_by: identity.user.id })
      .select("id,mentor_id,trainee_id,assigned_at")
      .single();
    if (error?.code === "23505") throw new ApiAuthError("Trainee đã được phân công cho Mentor này.", 409);
    if (error) throw error;
    return NextResponse.json({ assignment: data }, { status: 201 });
  } catch (error) {
    return apiError(error, "Không thể phân công Mentor–Trainee.");
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (identity.activeRole !== "Admin") {
      throw new ApiAuthError("Chỉ Admin được gỡ phân công Mentor–Trainee.", 403);
    }
    const url = new URL(request.url);
    const mentorId = requireUuid(url.searchParams.get("mentorId"), "Mã Mentor");
    const traineeId = requireUuid(url.searchParams.get("traineeId"), "Mã Trainee");
    const { data, error } = await getSupabaseAdmin()
      .from("mentor_trainees")
      .update({ revoked_at: new Date().toISOString(), revoked_by: identity.user.id })
      .eq("mentor_id", mentorId)
      .eq("trainee_id", traineeId)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiAuthError("Không tìm thấy phân công đang hoạt động.", 404);
    return NextResponse.json({ revoked: true, assignmentId: data.id });
  } catch (error) {
    return apiError(error, "Không thể gỡ phân công Mentor–Trainee.");
  }
}
