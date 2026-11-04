export function canAdoptServerDraft(serverVersion: number | undefined, adoptedVersion: number | undefined, dirty: boolean, cachedDraft: string | null): boolean {
  return serverVersion !== undefined && serverVersion !== adoptedVersion && !dirty && cachedDraft === null;
}
