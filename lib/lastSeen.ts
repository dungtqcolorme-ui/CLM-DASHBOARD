// In the current role model, PR Leader is the Mentor/management role.
export const LAST_SEEN_TRACKED_ROLES = ["Admin", "PR Leader"] as const;

const trackedRoles = new Set<string>(LAST_SEEN_TRACKED_ROLES);

export function shouldRecordLastSeen(roles: readonly string[]) {
  return roles.some((role) => trackedRoles.has(role));
}

type RecordLastSeenOptions = {
  userId: string;
  roles: readonly string[];
  now?: Date;
  write: (userId: string, seenAt: string) => Promise<string>;
};

/**
 * Records one activity timestamp for one explicit application-load event.
 * The caller owns the event boundary; this helper deliberately performs at
 * most one write and never installs timers, subscriptions, or render hooks.
 */
export async function recordLastSeenForAppLoad({
  userId,
  roles,
  now = new Date(),
  write,
}: RecordLastSeenOptions) {
  if (!shouldRecordLastSeen(roles)) return null;
  if (!userId || Number.isNaN(now.getTime())) {
    throw new Error("Dữ liệu lần truy cập không hợp lệ.");
  }
  return write(userId, now.toISOString());
}
