import type {
  Match,
  Player,
  Playoffs,
  Round,
  TournamentPhase,
  TournamentState,
} from "@/lib/tournament-schema";

export const PHASE_LABELS: Record<TournamentPhase, string> = {
  "round-robin": "Round robin",
  quarterfinals: "Quarterfinals",
  semifinals: "Semifinals",
  final: "Final",
  complete: "Complete",
};

export type Standing = {
  id: string;
  name: string;
  played: number;
  won: number;
  lost: number;
  gamesWon: number;
  gamesLost: number;
  gameDifference: number;
  headToHeadWins: number;
};

export function makeId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

export function createRoundRobin(players: Player[]): Round[] {
  const rotating: Array<string | null> = players.map((player) => player.id);
  if (rotating.length % 2 === 1) rotating.push(null);

  const rounds: Round[] = [];
  for (let roundIndex = 0; roundIndex < rotating.length - 1; roundIndex += 1) {
    const matches: Match[] = [];
    let bye: string | null = null;

    for (let pairIndex = 0; pairIndex < rotating.length / 2; pairIndex += 1) {
      let p1 = rotating[pairIndex];
      let p2 = rotating[rotating.length - 1 - pairIndex];
      if (roundIndex % 2 === 1) [p1, p2] = [p2, p1];

      if (p1 === null || p2 === null) {
        bye = p1 ?? p2;
      } else {
        matches.push({
          id: `rr-${roundIndex + 1}-${pairIndex + 1}`,
          p1,
          p2,
          s1: null,
          s2: null,
        });
      }
    }

    rounds.push({ number: roundIndex + 1, bye, matches });
    const last = rotating.pop();
    if (last !== undefined) rotating.splice(1, 0, last);
  }
  return rounds;
}

export function createTournament(name: string, playerNames: string[]): TournamentState {
  const players = playerNames.map((playerName) => ({
    id: makeId("player"),
    name: playerName.trim(),
  }));

  return {
    version: 1,
    id: makeId("tournament"),
    name: name.trim(),
    createdAt: new Date().toISOString(),
    phase: "round-robin",
    players,
    rounds: createRoundRobin(players),
    playoffs: null,
  };
}

export function allRoundRobinMatches(state: TournamentState) {
  return state.rounds.flatMap((round) => round.matches);
}

const pairKey = (a: string, b: string) => [a, b].sort().join(":");

/**
 * Add a player during the round-robin phase, preserving every result already
 * entered. The schedule is regenerated for the larger field (so the new player
 * is paired against everyone), then completed scores are copied back by matchup
 * — orientation-safe, since a regenerated match may list the pair in either
 * order. Only valid before a playoff bracket exists.
 */
export function addPlayer(state: TournamentState, name: string): TournamentState {
  if (state.phase !== "round-robin" || state.playoffs) {
    throw new Error("Players can only be added during the round robin");
  }
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A player name is required");
  if (state.players.length >= 64) throw new Error("A tournament can have at most 64 players");
  if (state.players.some((player) => player.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
    throw new Error("That player name is already taken");
  }

  const results = new Map<string, { s1: number; s2: number; p1: string }>();
  for (const match of allRoundRobinMatches(state)) {
    if (!isMatchComplete(match) || !match.p1 || !match.p2) continue;
    results.set(pairKey(match.p1, match.p2), { s1: match.s1, s2: match.s2, p1: match.p1 });
  }

  const players = [...state.players, { id: makeId("player"), name: trimmed }];
  const rounds = createRoundRobin(players);

  for (const round of rounds) {
    for (const match of round.matches) {
      if (!match.p1 || !match.p2) continue;
      const saved = results.get(pairKey(match.p1, match.p2));
      if (!saved) continue;
      const sameOrientation = saved.p1 === match.p1;
      match.s1 = sameOrientation ? saved.s1 : saved.s2;
      match.s2 = sameOrientation ? saved.s2 : saved.s1;
    }
  }

  return { ...state, players, rounds, phase: "round-robin", playoffs: null };
}

export function playoffMatches(playoffs: Playoffs | null) {
  return playoffs ? [...playoffs.qf, ...playoffs.sf, playoffs.final] : [];
}

export function isMatchComplete(match: Match | null | undefined): match is Match & {
  s1: number;
  s2: number;
} {
  return Number.isInteger(match?.s1) && Number.isInteger(match?.s2);
}

export function matchWinner(match: Match | null | undefined) {
  if (!isMatchComplete(match) || !match.p1 || !match.p2 || match.s1 === match.s2) {
    return null;
  }
  return match.s1 > match.s2 ? match.p1 : match.p2;
}

export function calculateStandings(state: TournamentState): Standing[] {
  const completed = allRoundRobinMatches(state).filter(isMatchComplete);
  const base = new Map<string, Standing>(
    state.players.map((player) => [
      player.id,
      {
        id: player.id,
        name: player.name,
        played: 0,
        won: 0,
        lost: 0,
        gamesWon: 0,
        gamesLost: 0,
        gameDifference: 0,
        headToHeadWins: 0,
      },
    ]),
  );

  for (const match of completed) {
    const a = base.get(match.p1!);
    const b = base.get(match.p2!);
    if (!a || !b) continue;
    a.played += 1;
    b.played += 1;
    a.gamesWon += match.s1;
    a.gamesLost += match.s2;
    b.gamesWon += match.s2;
    b.gamesLost += match.s1;
    if (match.s1 > match.s2) {
      a.won += 1;
      b.lost += 1;
    } else {
      b.won += 1;
      a.lost += 1;
    }
  }

  const rows = [...base.values()];
  for (const row of rows) {
    row.gameDifference = row.gamesWon - row.gamesLost;
  }

  // Head-to-head: among players level on match wins, count wins in the matches
  // played only between those tied players.
  const winGroups = new Map<number, Standing[]>();
  for (const row of rows) {
    const group = winGroups.get(row.won) ?? [];
    group.push(row);
    winGroups.set(row.won, group);
  }
  for (const tiedRows of winGroups.values()) {
    if (tiedRows.length < 2) continue;
    const tiedIds = new Set(tiedRows.map((row) => row.id));
    const headToHead = new Map(tiedRows.map((row) => [row.id, 0]));

    for (const match of completed) {
      if (!tiedIds.has(match.p1!) || !tiedIds.has(match.p2!)) continue;
      const winner = match.s1 > match.s2 ? match.p1! : match.p2!;
      headToHead.set(winner, headToHead.get(winner)! + 1);
    }

    for (const row of tiedRows) {
      row.headToHeadWins = headToHead.get(row.id)!;
    }
  }

  // Ranking ladder: match wins → head-to-head wins → overall game
  // difference → alphabetical (a stable, repeatable final tiebreak).
  return rows.sort((a, b) => {
    if (b.won !== a.won) return b.won - a.won;
    if (b.headToHeadWins !== a.headToHeadWins) return b.headToHeadWins - a.headToHeadWins;
    if (b.gameDifference !== a.gameDifference) return b.gameDifference - a.gameDifference;
    return a.name.localeCompare(b.name);
  });
}

export function createPlayoffs(seeds: string[]): Playoffs {
  if (seeds.length !== 8 || new Set(seeds).size !== 8) {
    throw new Error("Exactly eight unique seeds are required");
  }
  const pairs = [
    [0, 7],
    [3, 4],
    [1, 6],
    [2, 5],
  ];
  return {
    seeds: [...seeds],
    qf: pairs.map(([a, b], index) => ({
      id: `qf-${index}`,
      p1: seeds[a],
      p2: seeds[b],
      s1: null,
      s2: null,
    })),
    sf: [0, 1].map((index) => ({
      id: `sf-${index}`,
      p1: null,
      p2: null,
      s1: null,
      s2: null,
    })),
    final: { id: "final-0", p1: null, p2: null, s1: null, s2: null },
  };
}

export function updatePhase(playoffs: Playoffs | null): TournamentPhase {
  if (!playoffs) return "round-robin";
  if (isMatchComplete(playoffs.final)) return "complete";
  if (playoffs.sf.every(isMatchComplete)) return "final";
  if (playoffs.qf.every(isMatchComplete)) return "semifinals";
  return "quarterfinals";
}

export function syncPlayoffParticipants(playoffs: Playoffs): Playoffs {
  const next = structuredClone(playoffs);
  const semifinalPlayers: Array<[string | null, string | null]> = [
    [matchWinner(next.qf[0]), matchWinner(next.qf[1])],
    [matchWinner(next.qf[2]), matchWinner(next.qf[3])],
  ];

  next.sf.forEach((match, index) => {
    const [p1, p2] = semifinalPlayers[index];
    if (match.p1 !== p1 || match.p2 !== p2) {
      Object.assign(match, { p1, p2, s1: null, s2: null });
    }
  });

  const finalPlayers = [matchWinner(next.sf[0]), matchWinner(next.sf[1])];
  if (next.final.p1 !== finalPlayers[0] || next.final.p2 !== finalPlayers[1]) {
    Object.assign(next.final, {
      p1: finalPlayers[0],
      p2: finalPlayers[1],
      s1: null,
      s2: null,
    });
  }
  return next;
}

export function setResult(
  state: TournamentState,
  matchId: string,
  s1: number | null,
  s2: number | null,
) {
  const next = structuredClone(state);
  const matches = [
    ...allRoundRobinMatches(next),
    ...playoffMatches(next.playoffs),
  ];
  const match = matches.find((candidate) => candidate.id === matchId);
  if (!match) throw new Error(`Unknown match: ${matchId}`);
  match.s1 = s1;
  match.s2 = s2;

  if (!matchId.startsWith("rr-") && next.playoffs) {
    next.playoffs = syncPlayoffParticipants(next.playoffs);
    next.phase = updatePhase(next.playoffs);
  }
  return next;
}

export function replaceSeeds(state: TournamentState, seeds: string[]) {
  const next = structuredClone(state);
  next.playoffs = createPlayoffs(seeds);
  next.phase = "quarterfinals";
  return next;
}

export function currentRoundNumber(state: TournamentState) {
  return (
    state.rounds.find((round) =>
      round.matches.some((match) => !isMatchComplete(match)),
    )?.number ?? state.rounds.length
  );
}

export function validScoreOptions(bestOf: 3 | 5 | 7) {
  const target = Math.ceil(bestOf / 2);
  return Array.from({ length: target }, (_, loserScore) => [
    { s1: target, s2: loserScore },
    { s1: loserScore, s2: target },
  ]).flat();
}
