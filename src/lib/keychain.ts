// Persistent, device-local record of the tournaments this browser organizes.
// Maps a tournament slug to its organizer edit key so the manage/delete flow
// can act without re-prompting. Lives in localStorage (survives sessions),
// unlike the per-session `tt-edit-key:<slug>` copy used for live editing.

const STORAGE_KEY = "tt-keychain-v1";

type Keychain = Record<string, string>;

function read(): Keychain {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Keychain) : {};
  } catch {
    return {};
  }
}

function write(chain: Keychain) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chain));
  } catch {
    /* storage full or unavailable — non-fatal */
  }
}

export function rememberEditKey(slug: string, key: string) {
  const chain = read();
  chain[slug] = key;
  write(chain);
}

export function forgetEditKey(slug: string) {
  const chain = read();
  if (slug in chain) {
    delete chain[slug];
    write(chain);
  }
}

export function recallEditKey(slug: string): string | undefined {
  return read()[slug];
}

export function organizedSlugs(): string[] {
  return Object.keys(read());
}
