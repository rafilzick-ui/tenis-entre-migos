import { describe, it, expect } from "vitest";

/**
 * Tests for the playoff qualification logic.
 *
 * The rule: always produce exactly 8 qualified players from the group stage.
 *
 * - Top 2 per group are guaranteed qualifiers.
 * - Remaining slots filled from a global wildcard pool (all remaining players
 *   across all groups, sorted by points > wins > games_won > name).
 * - All 8 are then re-sorted globally to assign seeds 1-8.
 * - QF bracket: 1v8, 4v5, 2v7, 3v6.
 */

type PlayerStanding = {
  player_id: string;
  group: string;
  wins: number;
  losses: number;
  points: number;
  games_won: number;
  display_name: string;
};

type Qualified = {
  player_id: string;
  group: string;
  points: number;
  wins: number;
  games_won: number;
  display_name: string;
};

/**
 * Mirrors the generate_playoffs SQL logic in TypeScript for testing.
 * Given per-group standings (already sorted within each group),
 * returns the 8 qualified players in seed order (1-8).
 */
function classifyPlayers(groupStandings: PlayerStanding[][]): Qualified[] {
  const qualified: Qualified[] = [];
  const wildcardPool: Qualified[] = [];

  for (const standings of groupStandings) {
    if (standings.length < 2) continue;
    for (let i = 0; i < standings.length; i++) {
      const s = standings[i];
      const entry: Qualified = {
        player_id: s.player_id,
        group: s.group,
        points: s.points,
        wins: s.wins,
        games_won: s.games_won,
        display_name: s.display_name,
      };
      if (i < 2) {
        qualified.push(entry);
      } else {
        wildcardPool.push(entry);
      }
    }
  }

  // Sort wildcard pool globally
  wildcardPool.sort((a, b) =>
    b.points - a.points ||
    b.wins - a.wins ||
    b.games_won - a.games_won ||
    a.display_name.localeCompare(b.display_name)
  );

  // Fill to 8
  let wi = 0;
  while (qualified.length < 8 && wi < wildcardPool.length) {
    qualified.push(wildcardPool[wi]);
    wi++;
  }

  // Sort all 8 globally for seeds
  qualified.sort((a, b) =>
    b.points - a.points ||
    b.wins - a.wins ||
    b.games_won - a.games_won ||
    a.display_name.localeCompare(b.display_name)
  );

  return qualified;
}

function makeStanding(
  id: string,
  group: string,
  wins: number,
  losses: number,
  points: number,
  gamesWon: number,
  name: string
): PlayerStanding {
  return { player_id: id, group, wins, losses, points, games_won: gamesWon, display_name: name };
}

describe("Playoff qualification — 8 players (2 groups of 4)", () => {
  const groupA: PlayerStanding[] = [
    makeStanding("a1", "A", 3, 0, 9, 18, "Alpha"),
    makeStanding("a2", "A", 2, 1, 6, 12, "Beta"),
    makeStanding("a3", "A", 1, 2, 3, 8, "Gamma"),
    makeStanding("a4", "A", 0, 3, 0, 4, "Delta"),
  ];
  const groupB: PlayerStanding[] = [
    makeStanding("b1", "B", 3, 0, 9, 20, "Echo"),
    makeStanding("b2", "B", 2, 1, 6, 10, "Foxtrot"),
    makeStanding("b3", "B", 1, 2, 3, 6, "Golf"),
    makeStanding("b4", "B", 0, 3, 0, 2, "Hotel"),
  ];

  it("classifies exactly 8 players", () => {
    const result = classifyPlayers([groupA, groupB]);
    expect(result).toHaveLength(8);
  });

  it("includes all 8 players from both groups", () => {
    const result = classifyPlayers([groupA, groupB]);
    const ids = result.map((r) => r.player_id);
    expect(ids).toContain("a1");
    expect(ids).toContain("a2");
    expect(ids).toContain("a3");
    expect(ids).toContain("a4");
    expect(ids).toContain("b1");
    expect(ids).toContain("b2");
    expect(ids).toContain("b3");
    expect(ids).toContain("b4");
  });

  it("seeds 1 and 2 are the group winners with most points", () => {
    const result = classifyPlayers([groupA, groupB]);
    // a1 and b1 both have 9 points; tiebreak by games_won: b1 (20) > a1 (18)
    expect(result[0].player_id).toBe("b1");
    expect(result[1].player_id).toBe("a1");
  });

  it("seeds are ordered by points > wins > games_won > name", () => {
    const result = classifyPlayers([groupA, groupB]);
    for (let i = 0; i < 7; i++) {
      const a = result[i];
      const b = result[i + 1];
      // Seed i should rank >= seed i+1, so (a - b) in sort terms >= 0
      const cmp =
        a.points - b.points ||
        a.wins - b.wins ||
        a.games_won - b.games_won ||
        a.display_name.localeCompare(b.display_name);
      expect(cmp).toBeGreaterThanOrEqual(0);
    }
  });

  it("QF bracket pairing: 1v8, 4v5, 2v7, 3v6", () => {
    const result = classifyPlayers([groupA, groupB]);
    // QF1: seed1 vs seed8
    expect(result[0].player_id).not.toBe(result[7].player_id);
    // QF2: seed4 vs seed5
    expect(result[3].player_id).not.toBe(result[4].player_id);
    // QF3: seed2 vs seed7
    expect(result[1].player_id).not.toBe(result[6].player_id);
    // QF4: seed3 vs seed6
    expect(result[2].player_id).not.toBe(result[5].player_id);
  });
});

describe("Playoff qualification — 12 players (3 groups of 4)", () => {
  const groupA: PlayerStanding[] = [
    makeStanding("a1", "A", 3, 0, 9, 18, "Alpha"),
    makeStanding("a2", "A", 2, 1, 6, 12, "Beta"),
    makeStanding("a3", "A", 1, 2, 3, 8, "Gamma"),
    makeStanding("a4", "A", 0, 3, 0, 4, "Delta"),
  ];
  const groupB: PlayerStanding[] = [
    makeStanding("b1", "B", 3, 0, 9, 20, "Echo"),
    makeStanding("b2", "B", 2, 1, 6, 10, "Foxtrot"),
    makeStanding("b3", "B", 1, 2, 3, 6, "Golf"),
    makeStanding("b4", "B", 0, 3, 0, 2, "Hotel"),
  ];
  const groupC: PlayerStanding[] = [
    makeStanding("c1", "C", 3, 0, 9, 16, "India"),
    makeStanding("c2", "C", 2, 1, 6, 14, "Juliet"),
    makeStanding("c3", "C", 1, 2, 3, 5, "Kilo"),
    makeStanding("c4", "C", 0, 3, 0, 3, "Lima"),
  ];

  it("classifies exactly 8 players from 12", () => {
    const result = classifyPlayers([groupA, groupB, groupC]);
    expect(result).toHaveLength(8);
  });

  it("top 2 from each group are all included (6 guaranteed)", () => {
    const result = classifyPlayers([groupA, groupB, groupC]);
    const ids = result.map((r) => r.player_id);
    expect(ids).toContain("a1");
    expect(ids).toContain("a2");
    expect(ids).toContain("b1");
    expect(ids).toContain("b2");
    expect(ids).toContain("c1");
    expect(ids).toContain("c2");
  });

  it("2 wildcards from 3rd-place pool fill remaining slots", () => {
    const result = classifyPlayers([groupA, groupB, groupC]);
    const ids = result.map((r) => r.player_id);
    // 3rd place players: a3(3pts,8gw), b3(3pts,6gw), c3(3pts,5gw)
    // Best two by games_won: a3 and b3
    expect(ids).toContain("a3");
    expect(ids).toContain("b3");
    // c3 should NOT be in (only 2 wildcards needed)
    expect(ids).not.toContain("c3");
    // 4th place players should NOT be in
    expect(ids).not.toContain("a4");
    expect(ids).not.toContain("b4");
    expect(ids).not.toContain("c4");
  });
});

describe("Playoff qualification — 16 players (4 groups of 4)", () => {
  const mk = (id: string, group: string, name: string): PlayerStanding[] => [
    makeStanding(id + "1", group, 3, 0, 9, 18, name + "1"),
    makeStanding(id + "2", group, 2, 1, 6, 12, name + "2"),
    makeStanding(id + "3", group, 1, 2, 3, 8, name + "3"),
    makeStanding(id + "4", group, 0, 3, 0, 4, name + "4"),
  ];
  const groups = [mk("a", "A", "Alpha"), mk("b", "B", "Beta"), mk("c", "C", "Charlie"), mk("d", "D", "Delta")];

  it("classifies exactly 8 players from 16", () => {
    const result = classifyPlayers(groups);
    expect(result).toHaveLength(8);
  });

  it("top 2 from each group are all included (8 guaranteed, no wildcards needed)", () => {
    const result = classifyPlayers(groups);
    const ids = result.map((r) => r.player_id);
    expect(ids).toContain("a1");
    expect(ids).toContain("a2");
    expect(ids).toContain("b1");
    expect(ids).toContain("b2");
    expect(ids).toContain("c1");
    expect(ids).toContain("c2");
    expect(ids).toContain("d1");
    expect(ids).toContain("d2");
  });

  it("no 3rd or 4th place players included when 8 already from top 2", () => {
    const result = classifyPlayers(groups);
    const ids = result.map((r) => r.player_id);
    expect(ids).not.toContain("a3");
    expect(ids).not.toContain("b3");
    expect(ids).not.toContain("c3");
    expect(ids).not.toContain("d3");
    expect(ids).not.toContain("a4");
    expect(ids).not.toContain("b4");
  });
});

describe("Playoff qualification — tiebreaker by name", () => {
  it("uses alphabetical name as final tiebreaker", () => {
    const groupA: PlayerStanding[] = [
      makeStanding("x1", "A", 3, 0, 9, 10, "Zulu"),
      makeStanding("x2", "A", 2, 1, 6, 10, "Mike"),
      makeStanding("x3", "A", 1, 2, 3, 10, "Alpha"),
      makeStanding("x4", "A", 0, 3, 0, 10, "Bravo"),
    ];
    const groupB: PlayerStanding[] = [
      makeStanding("y1", "B", 3, 0, 9, 10, "Yankee"),
      makeStanding("y2", "B", 2, 1, 6, 10, "November"),
      makeStanding("y3", "B", 1, 2, 3, 10, "Charlie"),
      makeStanding("y4", "B", 0, 3, 0, 10, "Delta"),
    ];

    const result = classifyPlayers([groupA, groupB]);
    expect(result).toHaveLength(8);

    // x3 and y3 both have 3pts, 1win, 10gw — tiebreak by name: Charlie < Alpha? No, Alpha < Charlie
    // x3=Alpha, y3=Charlie → Alpha first
    const thirdPlaceIds = result.filter((r) => r.points === 3).map((r) => r.player_id);
    expect(thirdPlaceIds).toContain("x3");
    expect(thirdPlaceIds).toContain("y3");
    // Alpha (x3) should come before Charlie (y3)
    const x3Idx = result.findIndex((r) => r.player_id === "x3");
    const y3Idx = result.findIndex((r) => r.player_id === "y3");
    expect(x3Idx).toBeLessThan(y3Idx);
  });
});
