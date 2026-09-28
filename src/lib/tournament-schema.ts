import { z } from "zod";

export const matchSchema = z.object({
  id: z.string().min(1).max(80),
  p1: z.string().nullable(),
  p2: z.string().nullable(),
  s1: z.number().int().min(0).max(4).nullable(),
  s2: z.number().int().min(0).max(4).nullable(),
});

export const roundSchema = z.object({
  number: z.number().int().positive(),
  bye: z.string().nullable(),
  matches: z.array(matchSchema).max(256),
});

const tournamentBaseSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  createdAt: z.string().datetime(),
  phase: z.enum([
    "round-robin",
    "quarterfinals",
    "semifinals",
    "final",
    "complete",
  ]),
  players: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        name: z.string().trim().min(1).max(80),
      }),
    )
    .min(8)
    .max(64),
  rounds: z.array(roundSchema).min(1).max(64),
  playoffs: z
    .object({
      seeds: z.array(z.string()).length(8),
      qf: z.array(matchSchema).length(4),
      sf: z.array(matchSchema).length(2),
      final: matchSchema,
    })
    .nullable(),
});

function scoreIsValid(match: z.infer<typeof matchSchema>, target: number) {
  if (match.s1 === null && match.s2 === null) return true;
  if (match.s1 === null || match.s2 === null || match.s1 === match.s2) return false;
  return Math.max(match.s1, match.s2) === target && Math.min(match.s1, match.s2) < target;
}

function winnerOf(match: z.infer<typeof matchSchema>) {
  if (match.s1 === null || match.s2 === null || match.s1 === match.s2 || !match.p1 || !match.p2) return null;
  return match.s1 > match.s2 ? match.p1 : match.p2;
}

export const tournamentSchema = tournamentBaseSchema.superRefine((state, ctx) => {
  const playerIds = state.players.map((player) => player.id);
  const playerIdSet = new Set(playerIds);
  const normalizedNames = state.players.map((player) => player.name.toLocaleLowerCase());
  if (playerIdSet.size !== playerIds.length) {
    ctx.addIssue({ code: "custom", path: ["players"], message: "Player IDs must be unique" });
  }
  if (new Set(normalizedNames).size !== normalizedNames.length) {
    ctx.addIssue({ code: "custom", path: ["players"], message: "Player names must be unique" });
  }

  const rrMatches = state.rounds.flatMap((round) => round.matches);
  const expectedMatches = (state.players.length * (state.players.length - 1)) / 2;
  if (rrMatches.length !== expectedMatches) {
    ctx.addIssue({ code: "custom", path: ["rounds"], message: "Round-robin schedule has the wrong match count" });
  }

  const pairKeys = new Set<string>();
  const matchIds = new Set<string>();
  rrMatches.forEach((match, index) => {
    if (!match.p1 || !match.p2 || !playerIdSet.has(match.p1) || !playerIdSet.has(match.p2) || match.p1 === match.p2) {
      ctx.addIssue({ code: "custom", path: ["rounds", index], message: "Round-robin match has invalid players" });
    }
    const pairKey = [match.p1, match.p2].sort().join(":");
    if (pairKeys.has(pairKey)) ctx.addIssue({ code: "custom", path: ["rounds"], message: "Round-robin pairing is duplicated" });
    pairKeys.add(pairKey);
    if (matchIds.has(match.id)) ctx.addIssue({ code: "custom", path: ["rounds"], message: "Match IDs must be unique" });
    matchIds.add(match.id);
    if (!scoreIsValid(match, 2)) ctx.addIssue({ code: "custom", path: ["rounds"], message: "Invalid best-of-3 score" });
  });

  state.rounds.forEach((round, index) => {
    if (round.number !== index + 1) ctx.addIssue({ code: "custom", path: ["rounds", index, "number"], message: "Round numbers must be sequential" });
    if (round.bye && !playerIdSet.has(round.bye)) ctx.addIssue({ code: "custom", path: ["rounds", index, "bye"], message: "Round bye references an unknown player" });
  });

  if (!state.playoffs) {
    if (state.phase !== "round-robin") ctx.addIssue({ code: "custom", path: ["phase"], message: "A knockout phase requires a playoff bracket" });
    return;
  }

  if (new Set(state.playoffs.seeds).size !== 8 || state.playoffs.seeds.some((id) => !playerIdSet.has(id))) {
    ctx.addIssue({ code: "custom", path: ["playoffs", "seeds"], message: "Playoff seeds must be eight unique tournament players" });
  }
  const playoffRounds = [
    ...state.playoffs.qf.map((match) => ({ match, target: 3 })),
    ...state.playoffs.sf.map((match) => ({ match, target: 3 })),
    { match: state.playoffs.final, target: 4 },
  ];
  playoffRounds.forEach(({ match, target }) => {
    if ((match.p1 && !playerIdSet.has(match.p1)) || (match.p2 && !playerIdSet.has(match.p2))) {
      ctx.addIssue({ code: "custom", path: ["playoffs"], message: "Playoff match references an unknown player" });
    }
    if (matchIds.has(match.id)) ctx.addIssue({ code: "custom", path: ["playoffs"], message: "Match IDs must be unique" });
    matchIds.add(match.id);
    if (!scoreIsValid(match, target)) ctx.addIssue({ code: "custom", path: ["playoffs"], message: `Invalid best-of-${target * 2 - 1} score` });
  });

  const pairs = [[0, 7], [3, 4], [1, 6], [2, 5]];
  state.playoffs.qf.forEach((match, index) => {
    const [a, b] = pairs[index];
    if (match.p1 !== state.playoffs!.seeds[a] || match.p2 !== state.playoffs!.seeds[b]) {
      ctx.addIssue({ code: "custom", path: ["playoffs", "qf", index], message: "Quarterfinal players do not match the seed order" });
    }
  });
  const expectedSemis = [
    [winnerOf(state.playoffs.qf[0]), winnerOf(state.playoffs.qf[1])],
    [winnerOf(state.playoffs.qf[2]), winnerOf(state.playoffs.qf[3])],
  ];
  state.playoffs.sf.forEach((match, index) => {
    if (match.p1 !== expectedSemis[index][0] || match.p2 !== expectedSemis[index][1]) {
      ctx.addIssue({ code: "custom", path: ["playoffs", "sf", index], message: "Semifinal players do not match quarterfinal winners" });
    }
  });
  if (state.playoffs.final.p1 !== winnerOf(state.playoffs.sf[0]) || state.playoffs.final.p2 !== winnerOf(state.playoffs.sf[1])) {
    ctx.addIssue({ code: "custom", path: ["playoffs", "final"], message: "Final players do not match semifinal winners" });
  }

  const expectedPhase = scoreIsValid(state.playoffs.final, 4) && state.playoffs.final.s1 !== null
    ? "complete"
    : state.playoffs.sf.every((match) => match.s1 !== null)
      ? "final"
      : state.playoffs.qf.every((match) => match.s1 !== null)
        ? "semifinals"
        : "quarterfinals";
  if (state.phase !== expectedPhase) {
    ctx.addIssue({ code: "custom", path: ["phase"], message: "Tournament phase does not match playoff progress" });
  }
});

export type Match = z.infer<typeof matchSchema>;
export type Round = z.infer<typeof roundSchema>;
export type TournamentState = z.infer<typeof tournamentSchema>;
export type Player = TournamentState["players"][number];
export type Playoffs = NonNullable<TournamentState["playoffs"]>;
export type TournamentPhase = TournamentState["phase"];

export const createCloudTournamentSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(48)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  editKey: z.string().min(12).max(128),
  data: tournamentSchema,
});

export const updateCloudTournamentSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  data: tournamentSchema,
});

export function parseTournament(value: unknown) {
  return tournamentSchema.safeParse(value);
}
