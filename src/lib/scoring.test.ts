import { describe, it, expect } from "vitest";
import { computeWinner, canEnterSup, computePoints, computePointsFromSets } from "./scoring";

describe("computeWinner", () => {
  const p1 = "p1";
  const p2 = "p2";

  it("2x0 -> p1 wins", () => {
    const w = computeWinner({ set1P1: 6, set1P2: 3, set2P1: 6, set2P2: 4, supP1: null, supP2: null }, p1, p2);
    expect(w).toBe(p1);
  });

  it("2x0 -> p2 wins", () => {
    const w = computeWinner({ set1P1: 2, set1P2: 6, set2P1: 3, set2P2: 6, supP1: null, supP2: null }, p1, p2);
    expect(w).toBe(p2);
  });

  it("2x1 with SUP -> p1 wins", () => {
    const w = computeWinner({ set1P1: 6, set1P2: 3, set2P1: 3, set2P2: 6, supP1: 10, supP2: 7, winnerId: null }, p1, p2);
    expect(w).toBe(p1);
  });

  it("2x1 with SUP -> p2 wins", () => {
    const w = computeWinner({ set1P1: 6, set1P2: 3, set2P1: 3, set2P2: 6, supP1: 5, supP2: 10, winnerId: null }, p1, p2);
    expect(w).toBe(p2);
  });

  it("incomplete sets -> null", () => {
    const w = computeWinner({ set1P1: 6, set1P2: 3, set2P1: null, set2P2: null, supP1: null, supP2: null }, p1, p2);
    expect(w).toBeNull();
  });
});

describe("canEnterSup", () => {
  it("1x1 -> can enter SUP", () => {
    expect(canEnterSup({ set1P1: 6, set1P2: 3, set2P1: 3, set2P2: 6 })).toBe(true);
  });

  it("2x0 -> cannot enter SUP", () => {
    expect(canEnterSup({ set1P1: 6, set1P2: 3, set2P1: 6, set2P2: 4 })).toBe(false);
  });

  it("incomplete -> cannot enter SUP", () => {
    expect(canEnterSup({ set1P1: 6, set1P2: null, set2P1: null, set2P2: null })).toBe(false);
  });
});

describe("computePoints", () => {
  it("2x0 -> 18 / 0", () => {
    const r = computePoints({ set1P1: 6, set1P2: 3, set2P1: 6, set2P2: 4, supP1: null, supP2: null });
    expect(r).toEqual({ p1Points: 18, p2Points: 0 });
  });

  it("2x1 -> 18 / 9", () => {
    const r = computePoints({ set1P1: 6, set1P2: 3, set2P1: 3, set2P2: 6, supP1: 10, supP2: 7 });
    expect(r).toEqual({ p1Points: 18, p2Points: 9 });
  });

  it("1x1 without SUP -> 0 / 0", () => {
    const r = computePoints({ set1P1: 6, set1P2: 3, set2P1: 3, set2P2: 6, supP1: null, supP2: null });
    expect(r).toEqual({ p1Points: 0, p2Points: 0 });
  });

  it("2x1 p2 wins -> 9 / 18", () => {
    const r = computePoints({ set1P1: 3, set1P2: 6, set2P1: 6, set2P2: 3, supP1: 5, supP2: 10 });
    expect(r).toEqual({ p1Points: 9, p2Points: 18 });
  });
});

describe("computePointsFromSets", () => {
  it("2x0 -> winner p1, 18/0", () => {
    const r = computePointsFromSets(6, 3, 6, 4, null, null);
    expect(r?.winner).toBe("p1");
    expect(r?.p1Points).toBe(18);
    expect(r?.p2Points).toBe(0);
  });

  it("1x1 + SUP -> winner determined", () => {
    const r = computePointsFromSets(6, 3, 3, 6, 10, 7);
    expect(r?.winner).toBe("p1");
    expect(r?.p1Points).toBe(18);
    expect(r?.p2Points).toBe(9);
  });

  it("1x1 without SUP -> no winner", () => {
    const r = computePointsFromSets(6, 3, 3, 6, null, null);
    expect(r?.winner).toBeNull();
    expect(r?.p1Points).toBe(0);
    expect(r?.p2Points).toBe(0);
  });

  it("incomplete -> null", () => {
    const r = computePointsFromSets(null, 3, 6, 4, null, null);
    expect(r).toBeNull();
  });
});
