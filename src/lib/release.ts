// The download link is a permanent redirect that GitHub resolves to the newest asset, so a
// player's download can never break and the site never needs to know which version is current.
//
// Release *dates* are the one thing the redirect cannot tell us, and the sidebar shows two of
// them. They are fetched once per repo at build time and baked into the HTML as formatted text:
// no API URL, payload or timestamp-arithmetic ever reaches the browser, and the built site still
// makes no request of any kind. When the fetch fails — offline, rate-limited, no releases yet —
// this returns null and the caller drops both rows rather than rendering an empty one.

export interface ReleaseDates {
  /** ISO 8601 timestamp of the oldest release. */
  released: string;
  /** ISO 8601 timestamp of the newest release. */
  updated: string;
}

export function downloadUrl(repo: string, dll: string): string {
  return `https://github.com/${repo}/releases/latest/download/${dll}`;
}

/** `21 Aug 2026`. Absolute, because a weekly static rebuild would freeze "2 days ago" into a lie. */
export function formatDate(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(at);
}

/** The `datetime` attribute of a `<time>`: the calendar day, machine-readable. */
export function dateAttr(iso: string): string {
  return iso.slice(0, 10);
}

const inFlight = new Map<string, Promise<ReleaseDates | null>>();

/**
 * First and most recent release dates for a repo, or null if they cannot be had.
 * Memoised per repo: a repo is fetched once per build however many pages ask.
 */
export function releaseDates(repo: string): Promise<ReleaseDates | null> {
  let hit = inFlight.get(repo);
  if (!hit) {
    hit = fetchReleaseDates(repo);
    inFlight.set(repo, hit);
  }
  return hit;
}

async function fetchReleaseDates(repo: string): Promise<ReleaseDates | null> {
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'lwf-modding-site',
    };
    // The deploy Action hands us a token; a local build without one still works, just rate-limited.
    const token = process.env.GITHUB_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const body: unknown = await res.json();
    if (!Array.isArray(body)) return null;

    const stamps = body
      .map((r) => (r as { published_at?: unknown } | null)?.published_at)
      .filter((s): s is string => typeof s === 'string' && !Number.isNaN(Date.parse(s)))
      .sort();
    if (stamps.length === 0) return null;

    return { released: stamps[0], updated: stamps[stamps.length - 1] };
  } catch {
    // No network, DNS failure, timeout, malformed JSON — all the same answer: no dates.
    return null;
  }
}
