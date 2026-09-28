export type PlayerRanking = {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  played: number;
  won: number;
  lost: number;
  setsWon: number;
  setsLost: number;
  points: number;
};

export type MatchupHistory = Map<string, Set<string>>;

export type PairingResult = {
  pairs: [string, string][];
  bye: string | null;
  repeatedPairs: [string, string][];
};

export function matchupKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export function getHistory(history: MatchupHistory, playerId: string): Set<string> {
  return history.get(playerId) ?? new Set();
}

export function havePlayed(history: MatchupHistory, a: string, b: string): boolean {
  return getHistory(history, a).has(b);
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sortByRanking(ids: string[], rankings: PlayerRanking[]): string[] {
  const rankMap = new Map(rankings.map((r, i) => [r.playerId, i]));
  return [...ids].sort((a, b) => {
    const ra = rankMap.get(a) ?? 999;
    const rb = rankMap.get(b) ?? 999;
    return ra - rb;
  });
}

function pickBye(pool: string[], previousByes: Set<string>): string {
  const noBye = pool.find((p) => !previousByes.has(p));
  if (noBye) return noBye;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Score a potential pairing. Higher = better.
 * Penalizes repeated matchups heavily, then balances by ranking position.
 */
function scorePairing(
  a: string,
  b: string,
  history: MatchupHistory,
  rankings: PlayerRanking[],
): number {
  let score = 0;
  if (havePlayed(history, a, b)) score -= 10000;

  const rankA = rankings.findIndex((r) => r.playerId === a);
  const rankB = rankings.findIndex((r) => r.playerId === b);
  const rankDiff = Math.abs(rankA - rankB);
  score -= rankDiff * 100;

  return score;
}

/**
 * Greedily pick the best pairs from the pool, up to maxPairs.
 * Each player can only be used once per pass.
 */
function greedyPair(
  pool: string[],
  history: MatchupHistory,
  rankings: PlayerRanking[],
  maxPairs: number,
): { pairs: [string, string][]; leftover: string[] } {
  const available = [...pool];
  const pairs: [string, string][] = [];

  while (available.length >= 2 && pairs.length < maxPairs) {
    let best: { pair: [string, string]; score: number } | null = null;
    for (let i = 0; i < available.length; i++) {
      for (let j = i + 1; j < available.length; j++) {
        const s = scorePairing(available[i], available[j], history, rankings);
        if (!best || s > best.score) best = { pair: [available[i], available[j]], score: s };
      }
    }
    if (!best) break;
    pairs.push(best.pair);
    available.splice(available.indexOf(best.pair[0]), 1);
    available.splice(available.indexOf(best.pair[1]), 1);
  }

  return { pairs, leftover: available };
}

/**
 * Count how many matches a player already has in the current round's pairs.
 */
function matchCount(pairs: [string, string][], playerId: string): number {
  return pairs.filter(([a, b]) => a === playerId || b === playerId).length;
}

/**
 * Generate pairings for a round with up to 2 games per player.
 *
 * Algorithm:
 * 1. Shuffle players, pick BYE if odd count (prefer players who haven't had BYE)
 * 2. First pass: pair all players greedily (1 game each)
 * 3. Second pass: try to give each player a 2nd game, avoiding repeats
 * 4. No player is left out — everyone gets at least 1 game (or BYE)
 */
function generateRoundWithTwoGames(
  players: string[],
  history: MatchupHistory,
  rankings: PlayerRanking[],
  previousByes: Set<string>,
): PairingResult {
  const shuffled = shuffleArray(players);
  const hasOdd = shuffled.length % 2 !== 0;

  let bye: string | null = null;
  let pool = shuffled;
  if (hasOdd) {
    bye = pickBye(shuffled, previousByes);
    pool = shuffled.filter((p) => p !== bye);
  }

  // Pass 1: everyone gets 1 game
  const maxPairs1 = Math.floor(pool.length / 2);
  const pass1 = greedyPair(pool, history, rankings, maxPairs1);
  const allPairs = [...pass1.pairs];

  // Pass 2: try to give each player a 2nd game
  // Players who already have 1 game are candidates for a 2nd
  const playersWithOneGame = pool.filter((p) => matchCount(allPairs, p) === 1);
  if (playersWithOneGame.length >= 2) {
    // Add temporary history entries so pass-2 doesn't repeat pass-1 matchups
    const tempHistory: MatchupHistory = new Map(history);
    for (const [a, b] of allPairs) {
      if (!tempHistory.has(a)) tempHistory.set(a, new Set());
      if (!tempHistory.has(b)) tempHistory.set(b, new Set());
      tempHistory.get(a)!.add(b);
      tempHistory.get(b)!.add(a);
    }
    const maxPairs2 = Math.floor(playersWithOneGame.length / 2);
    const pass2 = greedyPair(playersWithOneGame, tempHistory, rankings, maxPairs2);
    allPairs.push(...pass2.pairs);
  }

  const repeatedPairs = allPairs.filter(([a, b]) => havePlayed(history, a, b));

  // Ensure no player is left out
  const playersInPairs = new Set(allPairs.flat());
  const leftover = pool.filter((p) => !playersInPairs.has(p));
  if (leftover.length > 0 && !bye) {
    bye = leftover[0];
  }

  return { pairs: allPairs, bye, repeatedPairs };
}

/**
 * Round 3: split into top 6 and rest, each sub-pool gets 2 games
 */
function generateRound3(
  players: string[],
  history: MatchupHistory,
  rankings: PlayerRanking[],
  previousByes: Set<string>,
): PairingResult {
  const sorted = sortByRanking(players, rankings);
  const top6 = sorted.slice(0, Math.min(6, sorted.length));
  const rest = sorted.slice(6);

  const topResult = generateRoundWithTwoGames(top6, history, rankings, previousByes);

  let restBye: string | null = null;
  let restPairs: [string, string][] = [];
  let restRepeated: [string, string][] = [];
  if (rest.length >= 2) {
    const restResult = generateRoundWithTwoGames(rest, history, rankings, previousByes);
    restPairs = restResult.pairs;
    restBye = restResult.bye;
    restRepeated = restResult.repeatedPairs;
  } else if (rest.length === 1) {
    restBye = rest[0];
  }

  const allPairs = [...topResult.pairs, ...restPairs];
  const bye = topResult.bye ?? restBye ?? null;
  const repeatedPairs = [...topResult.repeatedPairs, ...restRepeated];

  return { pairs: allPairs, bye, repeatedPairs };
}

export function generateRound1(
  players: string[],
  history: MatchupHistory,
  rankings: PlayerRanking[],
  previousByes: Set<string> = new Set(),
): PairingResult {
  return generateRoundWithTwoGames(players, history, rankings, previousByes);
}

export function generateRound2(
  players: string[],
  history: MatchupHistory,
  rankings: PlayerRanking[],
  previousByes: Set<string> = new Set(),
): PairingResult {
  return generateRoundWithTwoGames(players, history, rankings, previousByes);
}

export function generateRound4(
  players: string[],
  history: MatchupHistory,
  rankings: PlayerRanking[],
  previousByes: Set<string> = new Set(),
): PairingResult {
  return generateRoundWithTwoGames(players, history, rankings, previousByes);
}

export function generatePairings(
  roundNumber: 1 | 2 | 3 | 4,
  players: string[],
  history: MatchupHistory,
  rankings: PlayerRanking[],
  previousByes: Set<string> = new Set(),
): PairingResult {
  switch (roundNumber) {
    case 1: return generateRound1(players, history, rankings, previousByes);
    case 2: return generateRound2(players, history, rankings, previousByes);
    case 3: return generateRound3(players, history, rankings, previousByes);
    case 4: return generateRound4(players, history, rankings, previousByes);
  }
}
