import "server-only";

import type { AppRole } from "@/lib/authTypes";
import { MENTOR_ROLE, TRAINEE_ROLE, resolveAllowedTraineeIds } from "@/lib/mentorAccess";
import { ApiAuthError } from "@/lib/serverAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MentorIdentity = {
  user: { id: string };
  activeRole: AppRole;
};

export function requireUuid(value: unknown, label: string) {
  const id = String(value ?? "").trim();
  if (!UUID_PATTERN.test(id)) throw new ApiAuthError(`${label} không hợp lệ.`, 400);
  return id;
}

export async function activeProfileHasRole(userId: string, role: AppRole) {
  const admin = getSupabaseAdmin();
  const [profileResult, roleResult] = await Promise.all([
    admin.from("profiles").select("id,status").eq("id", userId).maybeSingle(),
    admin.from("user_roles").select("user_id").eq("user_id", userId).eq("role", role).maybeSingle(),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (roleResult.error) throw roleResult.error;
  return profileResult.data?.status === "active" && Boolean(roleResult.data);
}

export async function loadTraineeScope(identity: MentorIdentity, requestedTraineeId?: string | null) {
  const admin = getSupabaseAdmin();
  if (identity.activeRole !== "Admin" && identity.activeRole !== MENTOR_ROLE) {
    throw new ApiAuthError("Chỉ Admin hoặc Mentor được theo dõi Trainee.", 403);
  }

  const [{ data: roleRows, error: roleError }, { data: assignments, error: assignmentError }] = await Promise.all([
    admin.from("user_roles").select("user_id").eq("role", TRAINEE_ROLE),
    identity.activeRole === "Admin"
      ? Promise.resolve({ data: [], error: null })
      : admin
        .from("mentor_trainees")
        .select("trainee_id")
        .eq("mentor_id", identity.user.id)
        .is("revoked_at", null),
  ]);
  if (roleError) throw roleError;
  if (assignmentError) throw assignmentError;

  const allTraineeIds = [...new Set((roleRows ?? []).map((row) => row.user_id))];
  const assignedTraineeIds = [...new Set((assignments ?? []).map((row) => row.trainee_id))];
  try {
    return resolveAllowedTraineeIds({
      role: identity.activeRole,
      assignedTraineeIds,
      allTraineeIds,
      requestedTraineeId,
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      throw new ApiAuthError(error.message, Number(error.status));
    }
    throw error;
  }
}
