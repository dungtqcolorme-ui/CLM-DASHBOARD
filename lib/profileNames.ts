type ProfileNameRow = {
  id: string;
  full_name?: string | null;
};

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildProfileNameMap(rows: readonly ProfileNameRow[]) {
  return new Map(
    rows
      .map((row) => [row.id, cleanName(row.full_name)] as const)
      .filter(([id, name]) => Boolean(id && name)),
  );
}

/**
 * Resolves the current profile name by immutable user ID first. Historical
 * text is only a fallback for deleted/missing profiles, so a profile rename is
 * reflected everywhere that uses this resolver without rewriting task rows.
 */
export function resolveProfileName(
  namesByUserId: ReadonlyMap<string, string>,
  userId: string | null | undefined,
  historicalName?: string | null,
  fallback = "Người dùng",
) {
  return (userId ? cleanName(namesByUserId.get(userId)) : "")
    || cleanName(historicalName)
    || fallback;
}
