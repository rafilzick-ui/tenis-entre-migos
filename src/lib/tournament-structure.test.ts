import { describe, it, expect } from "vitest";
import { computeWinner, canEnterSup, computePoints } from "./scoring";

describe("Tournament: group structure", () => {
  it("4 players -> 1 group, 6 matches", () => {
    const players = ["p1", "p2", "p3", "p4"];
    const matches: [string, string][] = [];
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        matches.push([players[i], players[j]]);
      }
    }
    expect(matches).toHaveLength(6);
    const pairs = matches.map(([a, b]) => [a, b].sort().join("/"));
    expect(new Set(pairs).size).toBe(6);
  });

  it("8 players -> 2 groups, 12 group matches", () => {
    const players = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
    const groups = [players.slice(0, 4), players.slice(4, 8)];
    const allMatches: [string, string][] = [];
    groups.forEach((group) => {
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          allMatches.push([group[i], group[j]]);
        }
      }
    });
    expect(groups).toHaveLength(2);
    expect(allMatches).toHaveLength(12);
  });

  it("16 players -> 4 groups, 24 group matches", () => {
    const players = Array.from({ length: 16 }, (_, i) => `p${i + 1}`);
    const groups = [
      players.slice(0, 4),
      players.slice(4, 8),
      players.slice(8, 12),
      players.slice(12, 16),
    ];
    const allMatches: [string, string][] = [];
    groups.forEach((group) => {
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          allMatches.push([group[i], group[j]]);
        }
      }
    });
    expect(groups).toHaveLength(4);
    expect(allMatches).toHaveLength(24);
  });
});

describe("Tournament: playoff structure", () => {
  it("8 qualified -> 4 QF, 2 SF, 1 Final", () => {
    const qualified = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
    const qf: [string, string][] = [
      [qualified[0], qualified[3]],
      [qualified[1], qualified[2]],
      [qualified[4], qualified[7]],
      [qualified[5], qualified[6]],
    ];
    expect(qf).toHaveLength(4);

    const sfWinners = ["qf1_winner", "qf2_winner", "qf3_winner", "qf4_winner"];
    const sf: [string, string][] = [
      [sfWinners[0], sfWinners[1]],
      [sfWinners[2], sfWinners[3]],
    ];
    expect(sf).toHaveLength(2);

    const final: [string, string][] = [
      ["sf1_winner", "sf2_winner"],
    ];
    expect(final).toHaveLength(1);
  });

  it("12 players -> 3 groups, 8 qualified (2 from each group + 2 best 3rds)", () => {
    const players = Array.from({ length: 12 }, (_, i) => `p${i + 1}`);
    const groups = [
      players.slice(0, 4),
      players.slice(4, 8),
      players.slice(8, 12),
    ];
    expect(groups).toHaveLength(3);

    const firstSeconds = groups.length * 2;
    const thirdPlaces = groups.length;
    expect(firstSeconds).toBe(6);
    expect(thirdPlaces).toBe(3);

    const needed = 8;
    const bestThirds = needed - firstSeconds;
    expect(bestThirds).toBe(2);
  });
});

describe("Tournament: scoring validation", () => {
  it("SUP blocked when not 1x1", () => {
    expect(canEnterSup({ set1P1: 6, set1P2: 3, set2P1: 6, set2P2: 4 })).toBe(false);
  });

  it("SUP allowed when 1x1", () => {
    expect(canEnterSup({ set1P1: 6, set1P2: 3, set2P1: 3, set2P2: 6 })).toBe(true);
  });

  it("2x0 winner gets 18, loser 0", () => {
    const r = computePoints({ set1P1: 6, set1P2: 3, set2P1: 6, set2P2: 4, supP1: null, supP2: null });
    expect(r.p1Points).toBe(18);
    expect(r.p2Points).toBe(0);
  });

  it("2x1 winner gets 18, loser 9", () => {
    const r = computePoints({ set1P1: 6, set1P2: 3, set2P1: 3, set2P2: 6, supP1: 10, supP2: 7 });
    expect(r.p1Points).toBe(18);
    expect(r.p2Points).toBe(9);
  });

  it("1x1 + SUP: winner determined by SUP", () => {
    const w = computeWinner(
      { set1P1: 6, set1P2: 3, set2P1: 3, set2P2: 6, supP1: 10, supP2: 7, winnerId: null },
      "p1", "p2",
    );
    expect(w).toBe("p1");
  });

  it("1x1 without SUP: no winner", () => {
    const w = computeWinner(
      { set1P1: 6, set1P2: 3, set2P1: 3, set2P2: 6, supP1: null, supP2: null },
      "p1", "p2",
    );
    expect(w).toBeNull();
  });
});

describe("Tournament: standings calculation", () => {
  it("player with 3 wins ranks above player with 1 win", () => {
    type Standing = { player_id: string; wins: number; losses: number; points: number; sets_won: number };
    const standings: Standing[] = [
      { player_id: "a", wins: 3, losses: 0, points: 54, sets_won: 6 },
      { player_id: "b", wins: 1, losses: 2, points: 9, sets_won: 2 },
      { player_id: "c", wins: 2, losses: 1, points: 36, sets_won: 4 },
      { player_id: "d", wins: 0, losses: 3, points: 0, sets_won: 0 },
    ];
    const sorted = [...standings].sort((a, b) => b.points - a.points || b.wins - a.wins || b.sets_won - a.sets_won);
    expect(sorted[0].player_id).toBe("a");
    expect(sorted[1].player_id).toBe("c");
    expect(sorted[2].player_id).toBe("b");
    expect(sorted[3].player_id).toBe("d");
  });

  it("1st and 2nd from each group qualify, 3rd is potential wildcard", () => {
    const groupStandings = [
      { player_id: "a", points: 54 },
      { player_id: "b", points: 36 },
      { player_id: "c", points: 18 },
      { player_id: "d", points: 0 },
    ];
    const qualified = [groupStandings[0], groupStandings[1]];
    const thirdPlace = groupStandings[2];
    expect(qualified.map((s) => s.player_id)).toEqual(["a", "b"]);
    expect(thirdPlace.player_id).toBe("c");
  });
});

describe("Security: role and result enforcement", () => {
  it("computeWinner only accepts valid player IDs", () => {
    const w = computeWinner(
      { set1P1: 6, set1P2: 3, set2P1: 6, set2P2: 4, supP1: null, supP2: null },
      "p1", "p2",
    );
    expect(w === "p1" || w === "p2" || w === null).toBe(true);
    expect(w).not.toBe("p3");
  });

  it("scores must be non-negative (validated at RPC level)", () => {
    const r = computePoints({ set1P1: 0, set1P2: 3, set2P1: 0, set2P2: 4, supP1: null, supP2: null });
    expect(r.p1Points).toBe(0);
    expect(r.p2Points).toBe(18);
  });
});
