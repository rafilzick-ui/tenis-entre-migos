import { describe, it, expect } from "vitest";
import {
  generatePairings,
  generateRound1,
  generateRound2,
  generateRound3,
  generateRound4,
  matchupKey,
  havePlayed,
  type PlayerRanking,
  type MatchupHistory,
} from "./ranking-engine";

function makeRankings(ids: string[]): PlayerRanking[] {
  return ids.map((id, i) => ({
    playerId: id,
    displayName: `Player ${id}`,
    avatarUrl: null,
    played: ids.length - i,
    won: ids.length - i,
    lost: i,
    setsWon: (ids.length - i) * 2,
    setsLost: i * 2,
    points: (ids.length - i) * 18,
  }));
}

function emptyHistory(): MatchupHistory {
  return new Map();
}

function historyFromPairs(pairs: [string, string][]): MatchupHistory {
  const h: MatchupHistory = new Map();
  pairs.forEach(([a, b]) => {
    if (!h.has(a)) h.set(a, new Set());
    if (!h.has(b)) h.set(b, new Set());
    h.get(a)!.add(b);
    h.get(b)!.add(a);
  });
  return h;
}

describe("generateRound1", () => {
  it("4 players -> 2 pairs, no bye", () => {
    const players = ["a", "b", "c", "d"];
    const result = generateRound1(players, emptyHistory(), makeRankings(players));
    expect(result.pairs).toHaveLength(2);
    expect(result.bye).toBeNull();
    const allPaired = result.pairs.flat();
    expect(allPaired.sort()).toEqual(players.sort());
  });

  it("6 players -> 3 pairs, no bye", () => {
    const players = ["a", "b", "c", "d", "e", "f"];
    const result = generateRound1(players, emptyHistory(), makeRankings(players));
    expect(result.pairs).toHaveLength(3);
    expect(result.bye).toBeNull();
  });

  it("8 players -> 4 pairs, no bye", () => {
    const players = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const result = generateRound1(players, emptyHistory(), makeRankings(players));
    expect(result.pairs).toHaveLength(4);
  });

  it("10 players -> 5 pairs, no bye", () => {
    const players = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const result = generateRound1(players, emptyHistory(), makeRankings(players));
    expect(result.pairs).toHaveLength(5);
  });

  it("5 players (odd) -> 2 pairs, 1 bye", () => {
    const players = ["a", "b", "c", "d", "e"];
    const result = generateRound1(players, emptyHistory(), makeRankings(players));
    expect(result.pairs).toHaveLength(2);
    expect(result.bye).not.toBeNull();
    expect(players).toContain(result.bye);
    const allPaired = result.pairs.flat();
    expect(allPaired).not.toContain(result.bye);
  });

  it("7 players (odd) -> 3 pairs, 1 bye", () => {
    const players = ["a", "b", "c", "d", "e", "f", "g"];
    const result = generateRound1(players, emptyHistory(), makeRankings(players));
    expect(result.pairs).toHaveLength(3);
    expect(result.bye).not.toBeNull();
  });

  it("no repeated opponents when valid alternative exists", () => {
    const players = ["a", "b", "c", "d"];
    const history = historyFromPairs([["a", "b"], ["c", "d"]]);
    const result = generateRound1(players, history, makeRankings(players));
    expect(result.repeatedPairs).toHaveLength(0);
  });
});

describe("generateRound2", () => {
  it("pairs all players by ranking proximity", () => {
    const players = ["a", "b", "c", "d", "e", "f"];
    const result = generateRound2(players, emptyHistory(), makeRankings(players));
    expect(result.pairs).toHaveLength(3);
    expect(result.bye).toBeNull();
  });

  it("odd players -> bye assigned", () => {
    const players = ["a", "b", "c", "d", "e"];
    const result = generateRound2(players, emptyHistory(), makeRankings(players));
    expect(result.pairs).toHaveLength(2);
    expect(result.bye).not.toBeNull();
  });

  it("avoids repeated opponents", () => {
    const players = ["a", "b", "c", "d"];
    const history = historyFromPairs([["a", "b"], ["c", "d"]]);
    const result = generateRound2(players, history, makeRankings(players));
    expect(result.repeatedPairs).toHaveLength(0);
  });
});

describe("generateRound3", () => {
  it("TOP 6 play among themselves, rest among themselves", () => {
    const players = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const rankings = makeRankings(players);
    const result = generateRound3(players, emptyHistory(), rankings);
    expect(result.pairs.length).toBeGreaterThanOrEqual(4);

    const top6 = new Set(players.slice(0, 6));
    const rest = new Set(players.slice(6));

    result.pairs.forEach(([p1, p2]) => {
      const bothTop = top6.has(p1) && top6.has(p2);
      const bothRest = rest.has(p1) && rest.has(p2);
      expect(bothTop || bothRest).toBe(true);
    });
  });

  it("odd top6 -> bye in top group", () => {
    const players = ["a", "b", "c", "d", "e", "f", "g"];
    const rankings = makeRankings(players);
    const result = generateRound3(players, emptyHistory(), rankings);
    expect(result.bye).not.toBeNull();
  });

  it("avoids repeated opponents within groups when alternatives exist", () => {
    const players = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const history = historyFromPairs([["a", "b"], ["c", "d"], ["e", "f"], ["g", "h"]]);
    const result = generateRound3(players, history, makeRankings(players));
    const top6 = new Set(players.slice(0, 6));
    const topRepeats = result.repeatedPairs.filter(([p1, p2]) => top6.has(p1) && top6.has(p2));
    expect(topRepeats).toHaveLength(0);
  });
});

describe("generateRound4", () => {
  it("pairs all players avoiding repeats", () => {
    const players = ["a", "b", "c", "d", "e", "f"];
    const history = historyFromPairs([["a", "b"], ["c", "d"], ["e", "f"]]);
    const result = generateRound4(players, history, makeRankings(players));
    expect(result.pairs).toHaveLength(3);
    expect(result.repeatedPairs).toHaveLength(0);
  });

  it("odd players -> bye", () => {
    const players = ["a", "b", "c", "d", "e"];
    const result = generateRound4(players, emptyHistory(), makeRankings(players));
    expect(result.pairs).toHaveLength(2);
    expect(result.bye).not.toBeNull();
  });
});

describe("generatePairings dispatch", () => {
  it("round 1 delegates correctly", () => {
    const players = ["a", "b", "c", "d"];
    const r = generatePairings(1, players, emptyHistory(), makeRankings(players));
    expect(r.pairs).toHaveLength(2);
  });

  it("round 3 with 8 players separates top6 from rest", () => {
    const players = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const r = generatePairings(3, players, emptyHistory(), makeRankings(players));
    const top6 = new Set(players.slice(0, 6));
    r.pairs.forEach(([p1, p2]) => {
      const bothTop = top6.has(p1) && top6.has(p2);
      const bothRest = !top6.has(p1) && !top6.has(p2);
      expect(bothTop || bothRest).toBe(true);
    });
  });
});

describe("matchupKey", () => {
  it("produces consistent key regardless of order", () => {
    expect(matchupKey("a", "b")).toBe(matchupKey("b", "a"));
  });
});

describe("bye distribution", () => {
  it("bye player is chosen from those without previous byes", () => {
    const players = ["a", "b", "c", "d", "e"];
    const prevByes = new Set(["a", "b"]);
    const result = generateRound1(players, emptyHistory(), makeRankings(players), prevByes);
    expect(result.bye).not.toBeNull();
    expect(prevByes.has(result.bye!)).toBe(false);
  });
});
