import type { TournamentState } from "@/lib/tournament-schema";

export type CloudSnapshot = {
  slug: string;
  revision: number;
  updatedAt: string;
  data: TournamentState;
};

export type CloudMode = {
  slug: string;
  revision: number;
  updatedAt: string;
};
