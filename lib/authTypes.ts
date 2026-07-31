export const APP_ROLES = [
  "Admin",
  "PR Leader",
  "PR Representative",
  "Viewer",
] as const;

export type AppRole = (typeof APP_ROLES)[number];
export type ProfileStatus = "active" | "pending" | "locked";

export type AuthProfile = {
  id: string;
  email: string;
  fullName: string;
  status: ProfileStatus;
  roles: AppRole[];
  createdAt: string;
  updatedAt: string;
  lastSignInAt?: string | null;
  dateOfBirth?: string | null;
  phone?: string;
  avatarPath?: string;
  avatarUrl?: string;
};

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.includes(value as AppRole);
}

export function isProfileStatus(value: unknown): value is ProfileStatus {
  return value === "active" || value === "pending" || value === "locked";
}

export function dashboardRole(role: AppRole) {
  if (role === "PR Leader") return "Leader";
  if (role === "PR Representative") return "Staff";
  return role;
}
