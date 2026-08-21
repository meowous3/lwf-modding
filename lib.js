// Shared data access. Everything is read from GitHub at load time, so adding a mod is one
// line in mods.json and publishing a release is enough to update a download link.

const API = 'https://api.github.com';
const SELF = 'meowous3/lwf-modding';
const TTL = 10 * 60 * 1000;

// Unauthenticated GitHub allows 60 requests an hour per address. Caching keeps a few
// reloads while reading from exhausting it.
export async function cached(key, fetcher) {
  try {
    const hit = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (hit && Date.now() - hit.at < TTL) return hit.value;
  } catch { /* unavailable or unparseable; just fetch */ }

  const value = await fetcher();
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
  } catch { /* over quota or blocked; caching is optional */ }
  return value;
}

// Rendered HTML rather than raw: no Markdown parser to ship, and the page shows what
// GitHub shows.
async function markdown(url) {
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github.html' } });
  if (!res.ok) throw new Error(String(res.status));
  return res.text();
}

export const readme = (repo) =>
  cached(`readme:${repo}`, () => markdown(`${API}/repos/${repo}/readme`));

export const guideBody = (file) =>
  cached(`guide:${file}`, () => markdown(`${API}/repos/${SELF}/contents/${file}`));

export const manifest = (name) =>
  cached(`manifest:${name}`, async () => (await fetch(`${name}.json`, { cache: 'no-cache' })).json());

export async function repoInfo(repo) {
  return cached(`repo:${repo}`, async () => {
    const res = await fetch(`${API}/repos/${repo}`);
    if (!res.ok) throw new Error(String(res.status));
    const { description } = await res.json();
    return { description };
  });
}

export async function latestRelease(repo) {
  return cached(`release:${repo}`, async () => {
    const res = await fetch(`${API}/repos/${repo}/releases/latest`);
    if (!res.ok) return null;              // no release yet is normal, not an error
    const data = await res.json();
    const dll = (data.assets || []).find((a) => a.name.endsWith('.dll'));
    return { tag: data.tag_name, url: dll?.browser_download_url ?? null };
  });
}

export const escape = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function downloadButton(release) {
  return release?.url
    ? `<a class="btn" href="${escape(release.url)}" download>Download ${escape(release.tag)}</a>`
    : '<span class="btn" aria-disabled="true">No release yet</span>';
}

// A mod card, used on the home page and the mods index.
export async function modCard(repo) {
  const name = repo.split('/')[1];
  const [info, release] = await Promise.all([
    repoInfo(repo).catch(() => ({})),
    latestRelease(repo).catch(() => null),
  ]);

  return el(`
    <article class="card">
      <h3><a href="mod.html?r=${encodeURIComponent(repo)}">${escape(name)}</a></h3>
      <p class="desc">${escape(info.description || '')}</p>
      <div class="actions">
        ${downloadButton(release)}
        <a class="btn ghost" href="mod.html?r=${encodeURIComponent(repo)}">Details</a>
        <a class="btn ghost" href="https://github.com/${escape(repo)}">Source</a>
      </div>
    </article>`);
}
