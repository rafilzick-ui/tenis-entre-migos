/**
 * Scoring utilities for friendly matches.
 *
 * IMPORTANT: These functions are completely isolated from the official
 * Ranking and Tournament scoring. Friendly match results never feed into
 * any official competition data.
 */

export type FriendlyScore = {
  set1_p1: number | null;
  set1_p2: number | null;
  set2_p1: number | null;
  set2_p2: number | null;
  sup_p1: number | null;
  sup_p2: number | null;
};

export type FriendlyWinner = "p1" | "p2" | "tie";

/**
 * Determine the winner of a friendly match from the set scores.
 * Returns "p1", "p2", or "tie" (only possible if sup scores are also tied or missing).
 */
export function computeWinner(score: FriendlyScore): FriendlyWinner | null {
  const { set1_p1, set1_p2, set2_p1, set2_p2, sup_p1, sup_p2 } = score;

  if (set1_p1 === null || set1_p2 === null) return null;

  let p1Sets = 0;
  let p2Sets = 0;

  if (set1_p1 > set1_p2) p1Sets++;
  else if (set1_p2 > set1_p1) p2Sets++;

  if (set2_p1 !== null && set2_p2 !== null) {
    if (set2_p1 > set2_p2) p1Sets++;
    else if (set2_p2 > set2_p1) p2Sets++;
  }

  // If tied 1-1 and we have sup scores, use them
  if (p1Sets === 1 && p2Sets === 1 && sup_p1 !== null && sup_p2 !== null) {
    if (sup_p1 > sup_p2) p1Sets++;
    else if (sup_p2 > sup_p1) p2Sets++;
  }

  if (p1Sets > p2Sets) return "p1";
  if (p2Sets > p1Sets) return "p2";

  // If only one set was played and it's a tie, or sup is also tied
  return null;
}

/**
 * Validate that a score is internally consistent (no negative values,
 * no ties without sup, etc.).
 * Returns an error message string or null if valid.
 */
export function validateFriendlyScore(score: FriendlyScore): string | null {
  const { set1_p1, set1_p2, set2_p1, set2_p2, sup_p1, sup_p2 } = score;

  if (set1_p1 === null || set1_p2 === null) {
    return "Informe o placar do primeiro set.";
  }
  if (set1_p1 < 0 || set1_p2 < 0) return "Placares nao podem ser negativos.";
  if (set1_p1 === set1_p2) return "O primeiro set nao pode terminar em empate.";

  if (set2_p1 !== null && set2_p2 !== null) {
    if (set2_p1 < 0 || set2_p2 < 0) return "Placares nao podem ser negativos.";
    if (set2_p1 === set2_p2) return "O segundo set nao pode terminar em empate.";
  }

  // If two sets are split 1-1, sup is required
  let p1Sets = 0;
  let p2Sets = 0;
  if (set1_p1 > set1_p2) p1Sets++;
  else p2Sets++;
  if (set2_p1 !== null && set2_p2 !== null) {
    if (set2_p1 > set2_p2) p1Sets++;
    else p2Sets++;
  }

  if (p1Sets === 1 && p2Sets === 1) {
    if (sup_p1 === null || sup_p2 === null) {
      return "Os sets empataram 1-1. Informe o placar do SUP (tiebreak).";
    }
    if (sup_p1 < 0 || sup_p2 < 0) return "Placar do SUP nao pode ser negativo.";
    if (sup_p1 === sup_p2) return "O SUP nao pode terminar em empate.";
  }

  return null;
}
