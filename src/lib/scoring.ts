export type TournamentStatus = "registration" | "groups_drawn" | "playoffs" | "complete";
export type RankingRoundStatus = "open" | "in_progress" | "complete";

export type PlayerStats = {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  played: number;
  won: number;
  lost: number;
  setsWon: number;
  setsLost: number;
  points: number;
  position: number;
};

export type MatchScore = {
  set1P1: number | null;
  set1P2: number | null;
  set2P1: number | null;
  set2P2: number | null;
  supP1: number | null;
  supP2: number | null;
  winnerId?: string | null;
};

export function computeWinner(score: MatchScore, p1Id: string, p2Id: string): string | null {
  const s1P1 = score.set1P1;
  const s1P2 = score.set1P2;
  const s2P1 = score.set2P1;
  const s2P2 = score.set2P2;

  if (s1P1 === null || s1P2 === null || s2P1 === null || s2P2 === null) return null;

  let p1Sets = 0;
  let p2Sets = 0;
  if (s1P1 > s1P2) p1Sets++;
  else if (s1P2 > s1P1) p2Sets++;
  if (s2P1 > s2P2) p1Sets++;
  else if (s2P2 > s2P1) p2Sets++;

  if (p1Sets === 2) return p1Id;
  if (p2Sets === 2) return p2Id;

  if (score.supP1 !== null && score.supP2 !== null) {
    return score.supP1 > score.supP2 ? p1Id : score.supP2 > score.supP1 ? p2Id : null;
  }

  return null;
}

export function canEnterSup(score: Pick<MatchScore, "set1P1" | "set1P2" | "set2P1" | "set2P2">): boolean {
  const { set1P1, set1P2, set2P1, set2P2 } = score;
  if (set1P1 === null || set1P2 === null || set2P1 === null || set2P2 === null) return false;
  let p1Sets = 0;
  let p2Sets = 0;
  if (set1P1 > set1P2) p1Sets++; else if (set1P2 > set1P1) p2Sets++;
  if (set2P1 > set2P2) p1Sets++; else if (set2P2 > set2P1) p2Sets++;
  return p1Sets === 1 && p2Sets === 1;
}

export function computePoints(score: MatchScore): { p1Points: number; p2Points: number } {
  const s1P1 = score.set1P1;
  const s1P2 = score.set1P2;
  const s2P1 = score.set2P1;
  const s2P2 = score.set2P2;

  if (s1P1 === null || s1P2 === null || s2P1 === null || s2P2 === null) {
    return { p1Points: 0, p2Points: 0 };
  }

  let p1Sets = 0;
  let p2Sets = 0;
  if (s1P1 > s1P2) p1Sets++;
  else if (s1P2 > s1P1) p2Sets++;
  if (s2P1 > s2P2) p1Sets++;
  else if (s2P2 > s2P1) p2Sets++;

  if (p1Sets === 2 && p2Sets === 0) return { p1Points: 18, p2Points: 0 };
  if (p2Sets === 2 && p1Sets === 0) return { p1Points: 0, p2Points: 18 };
  if (p1Sets === 1 && p2Sets === 1) {
    if (score.supP1 !== null && score.supP2 !== null && score.supP1 !== score.supP2) {
      if (score.supP1 > score.supP2) return { p1Points: 18, p2Points: 9 };
      return { p1Points: 9, p2Points: 18 };
    }
    return { p1Points: 0, p2Points: 0 };
  }
  if (p1Sets === 2 && p2Sets === 1) return { p1Points: 18, p2Points: 9 };
  if (p2Sets === 2 && p1Sets === 1) return { p1Points: 9, p2Points: 18 };

  return { p1Points: 0, p2Points: 0 };
}

export function computePointsFromSets(
  s1P1: number | null, s1P2: number | null,
  s2P1: number | null, s2P2: number | null,
  supP1: number | null, supP2: number | null,
): { p1Points: number; p2Points: number; winner: string | null; p1Id: string; p2Id: string } | null {
  if (s1P1 === null || s1P2 === null || s2P1 === null || s2P2 === null) return null;

  let p1Sets = 0;
  let p2Sets = 0;
  if (s1P1 > s1P2) p1Sets++; else if (s1P2 > s1P1) p2Sets++;
  if (s2P1 > s2P2) p1Sets++; else if (s2P2 > s2P1) p2Sets++;

  let p1Points = 0;
  let p2Points = 0;
  let winner: "p1" | "p2" | null = null;

  if (p1Sets === 2 && p2Sets === 0) { p1Points = 18; p2Points = 0; winner = "p1"; }
  else if (p2Sets === 2 && p1Sets === 0) { p1Points = 0; p2Points = 18; winner = "p2"; }
  else if (p1Sets === 1 && p2Sets === 1) {
    if (supP1 !== null && supP2 !== null && supP1 !== supP2) {
      if (supP1 > supP2) { winner = "p1"; p1Points = 18; p2Points = 9; }
      else { winner = "p2"; p1Points = 9; p2Points = 18; }
    }
  }
  else if (p1Sets === 2 && p2Sets === 1) { p1Points = 18; p2Points = 9; winner = "p1"; }
  else if (p2Sets === 2 && p1Sets === 1) { p1Points = 9; p2Points = 18; winner = "p2"; }

  return { p1Points, p2Points, winner, p1Id: "", p2Id: "" };
}

// Tournament 1-set scoring: winner = higher score, no SUP, no ties
export function computeTournament1SetWinner(
  scoreP1: number,
  scoreP2: number,
  p1Id: string,
  p2Id: string,
): string | null {
  if (scoreP1 < 0 || scoreP2 < 0) return null;
  if (scoreP1 === scoreP2) return null;
  return scoreP1 > scoreP2 ? p1Id : p2Id;
}
