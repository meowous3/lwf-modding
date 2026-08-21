// The download link is a permanent redirect that GitHub resolves to the newest asset, so a
// player's download can never be broken by a rate limit. Only the version *label* needs the
// API, and only at build time.
const API = 'https://api.github.com';
const cache = new Map<string, Promise<string | null>>();

export function downloadUrl(repo: string, dll: string): string {
  return `https://github.com/${repo}/releases/latest/download/${dll}`;
}

export function latestTag(repo: string, fallback?: string): Promise<string | null> {
  if (!cache.has(repo)) cache.set(repo, fetchTag(repo, fallback));
  return cache.get(repo)!;
}

async function fetchTag(repo: string, fallback?: string): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN;
  try {
    const res = await fetch(`${API}/repos/${repo}/releases/latest`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return fallback ?? null;
    const data = (await res.json()) as { tag_name?: string };
    return data.tag_name ?? fallback ?? null;
  } catch {
    return fallback ?? null;
  }
}
