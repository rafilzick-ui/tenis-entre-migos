import { describe, it, expect } from "vitest";
import { computeTournament1SetWinner } from "./scoring";

describe("Tournament 1-set scoring", () => {
  const p1 = "p1";
  const p2 = "p2";

  it("p1 wins with higher score", () => {
    expect(computeTournament1SetWinner(6, 4, p1, p2)).toBe(p1);
  });

  it("p2 wins with higher score", () => {
    expect(computeTournament1SetWinner(3, 7, p1, p2)).toBe(p2);
  });

  it("tie -> null (no winner allowed)", () => {
    expect(computeTournament1SetWinner(5, 5, p1, p2)).toBeNull();
  });

  it("negative scores -> null", () => {
    expect(computeTournament1SetWinner(-1, 4, p1, p2)).toBeNull();
    expect(computeTournament1SetWinner(6, -2, p1, p2)).toBeNull();
  });

  it("zero scores: 0x0 is a tie -> null", () => {
    expect(computeTournament1SetWinner(0, 0, p1, p2)).toBeNull();
  });

  it("0x1 -> p2 wins (0 is valid non-negative)", () => {
    expect(computeTournament1SetWinner(0, 1, p1, p2)).toBe(p2);
  });
});

describe("Tournament group draw — match counts", () => {
  function expectedGroupsAndMatches(n: number) {
    const groups = n / 4;
    const matchesPerGroup = 6; // C(4,2) = 6
    return { groups, totalMatches: groups * matchesPerGroup };
  }

  it("4 players -> 1 group, 6 matches", () => {
    const r = expectedGroupsAndMatches(4);
    expect(r.groups).toBe(1);
    expect(r.totalMatches).toBe(6);
  });

  it("8 players -> 2 groups, 12 matches", () => {
    const r = expectedGroupsAndMatches(8);
    expect(r.groups).toBe(2);
    expect(r.totalMatches).toBe(12);
  });

  it("12 players -> 3 groups, 18 matches", () => {
    const r = expectedGroupsAndMatches(12);
    expect(r.groups).toBe(3);
    expect(r.totalMatches).toBe(18);
  });

  it("16 players -> 4 groups, 24 matches", () => {
    const r = expectedGroupsAndMatches(16);
    expect(r.groups).toBe(4);
    expect(r.totalMatches).toBe(24);
  });
});

describe("Ranking match counts per round", () => {
  function expectedRankingMatches(n: number): { matches: number; byes: number } {
    if (n % 2 === 0) {
      return { matches: n / 2, byes: 0 };
    }
    return { matches: (n - 1) / 2, byes: 1 };
  }

  it("4 players -> 2 matches, 0 byes", () => {
    expect(expectedRankingMatches(4)).toEqual({ matches: 2, byes: 0 });
  });

  it("6 players -> 3 matches, 0 byes", () => {
    expect(expectedRankingMatches(6)).toEqual({ matches: 3, byes: 0 });
  });

  it("8 players -> 4 matches, 0 byes", () => {
    expect(expectedRankingMatches(8)).toEqual({ matches: 4, byes: 0 });
  });

  it("10 players -> 5 matches, 0 byes", () => {
    expect(expectedRankingMatches(10)).toEqual({ matches: 5, byes: 0 });
  });

  it("12 players -> 6 matches, 0 byes", () => {
    expect(expectedRankingMatches(12)).toEqual({ matches: 6, byes: 0 });
  });

  it("5 players (odd) -> 2 matches, 1 bye", () => {
    expect(expectedRankingMatches(5)).toEqual({ matches: 2, byes: 1 });
  });

  it("7 players (odd) -> 3 matches, 1 bye", () => {
    expect(expectedRankingMatches(7)).toEqual({ matches: 3, byes: 1 });
  });

  it("9 players (odd) -> 4 matches, 1 bye", () => {
    expect(expectedRankingMatches(9)).toEqual({ matches: 4, byes: 1 });
  });
});
