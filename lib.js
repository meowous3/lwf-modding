// Shared data access. Everything is read from GitHub at load time, so adding a mod is one
// line in mods.json and publishing a release is enough to update a download link.

const API = 'https://api.github.com';
const SELF = 'meowous3/lwf-modding';
const TTL = 10 * 60 * 1000;
const CACHE = 'v2';   // bump to retire entries cached by an older build

// Unauthenticated GitHub allows 60 requests an hour per address. Caching keeps a few
// reloads while reading from exhausting it.
export async function cached(key, fetcher) {
  key = `${CACHE}:${key}`;
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
  cached(`readme:${repo}`, async () => absolutise(await markdown(`${API}/repos/${repo}/readme`), repo));

export const guideBody = (file) =>
  cached(`guide:${file}`, async () =>
    absolutise(await markdown(`${API}/repos/${SELF}/contents/${file}`), SELF, dirname(file)));

const dirname = (path) => path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';

// GitHub renders relative paths as-is, so a README's `docs/shot.png` would resolve against
// this site and 404. Rewriting them here keeps every README working unedited — a mod added
// to mods.json needs nothing done to it.
//
// `HEAD` stands in for the default branch, which saves asking what it is called.
function absolutise(html, repo, base = '') {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const isRelative = (v) => v && !/^(https?:|mailto:|#|\/)/i.test(v);

  doc.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src');
    if (isRelative(src)) img.setAttribute('src', `https://raw.githubusercontent.com/${repo}/HEAD/${base}${src}`);
    img.setAttribute('loading', 'lazy');
  });

  doc.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (!isRelative(href)) return;

    // A link between guides stays on this site rather than bouncing to GitHub.
    const guide = GUIDE_SLUGS.get((base + href).replace(/^\.\//, ''));
    a.setAttribute('href', guide
      ? `guide.html?g=${encodeURIComponent(guide)}`
      : `https://github.com/${repo}/blob/HEAD/${base}${href}`);
  });

  return doc.body.innerHTML;
}

// Filled once the guide manifest is read, so cross-links resolve without another fetch.
const GUIDE_SLUGS = new Map();
export const registerGuides = (guides) =>
  guides.forEach((g) => GUIDE_SLUGS.set(g.file, g.slug));

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
