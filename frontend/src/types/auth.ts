export type UserRole = "admin" | "manager" | "staff";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};
