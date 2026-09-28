export type UserRole = "player" | "admin";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  display_name: string;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  skill_level: number;
  created_at: string;
};

export type AuthState = {
  user: { id: string; email: string } | null;
  profile: Profile | null;
  loading: boolean;
};
