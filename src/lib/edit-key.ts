export function hashEditKey(editKey: string): string {
  // Browser-side hash is only used for display; the server (edge function)
  // does the authoritative hash with a pepper. This is a non-crypto fallback.
  const encoder = new TextEncoder();
  const data = encoder.encode(`browser:${editKey}`);
  return Array.from(data).reduce((hash, byte) => ((hash << 5) - hash + byte) | 0, 0).toString(16);
}

export function editKeyMatches(_editKey: string, _expectedHash: string): boolean {
  // Verification is always done server-side. This stub exists only to satisfy
  // imports in components that reference the function name.
  return false;
}
