// Everything is read from GitHub at load time, so adding a mod is one line in mods.json
// and publishing a release is enough to update the download link.

const API = 'https://api.github.com';
const GUIDES = [
  { file: 'guides/MODDING.md', label: 'For people' },
  { file: 'guides/AGENTS.md', label: 'For agents' },
];
const SELF = 'meowous3/lwf-modding';
const TTL = 10 * 60 * 1000;

// Unauthenticated GitHub allows 60 requests an hour per address. A page load costs about
// four, so a few reloads while reading would otherwise exhaust it.
async function cached(key, fetcher) {
  try {
    const hit = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (hit && Date.now() - hit.at < TTL) return hit.value;
  } catch { /* storage unavailable or unparseable; just fetch */ }

  const value = await fetcher();
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
  } catch { /* over quota or blocked; caching is optional */ }
  return value;
}

// Asking for the rendered HTML avoids shipping a Markdown parser, and means the page shows
// exactly what GitHub shows.
async function markdown(url) {
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github.html' } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

const readme = (repo) => cached(`readme:${repo}`, () => markdown(`${API}/repos/${repo}/readme`));
const guide = (file) => cached(`guide:${file}`, () => markdown(`${API}/repos/${SELF}/contents/${file}`));

async function repoInfo(repo) {
  return cached(`repo:${repo}`, async () => {
    const res = await fetch(`${API}/repos/${repo}`);
    if (!res.ok) throw new Error(`${res.status}`);
    const { description, stargazers_count } = await res.json();
    return { description, stars: stargazers_count };
  });
}

async function latestRelease(repo) {
  return cached(`release:${repo}`, async () => {
    const res = await fetch(`${API}/repos/${repo}/releases/latest`);
    if (!res.ok) return null;            // no release yet is normal, not an error
    const data = await res.json();
    const dll = (data.assets || []).find((a) => a.name.endsWith('.dll'));
    return { tag: data.tag_name, url: dll?.browser_download_url ?? null, name: dll?.name ?? null };
  });
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const escape = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function renderMod(repo) {
  const name = repo.split('/')[1];
  const [info, release] = await Promise.all([
    repoInfo(repo).catch(() => ({})),
    latestRelease(repo).catch(() => null),
  ]);

  const download = release?.url
    ? `<a class="btn" href="${escape(release.url)}" download>Download ${escape(release.tag)}</a>`
    : `<span class="btn" aria-disabled="true">No release</span>`;

  const card = el(`
    <article class="mod">
      <div class="mod-head">
        <div>
          <h3><a href="https://github.com/${escape(repo)}">${escape(name)}</a></h3>
          <div class="mod-meta">${escape(info.description || '')}</div>
        </div>
        <div class="actions">
          ${download}
          <a class="btn ghost" href="https://github.com/${escape(repo)}">Source</a>
        </div>
      </div>
      <div class="md"><p class="loading">Loading&hellip;</p></div>
    </article>`);

  const body = card.querySelector('.md');
  try {
    body.innerHTML = await readme(repo);
  } catch {
    body.innerHTML = `<p class="error">Could not load the README. <a href="https://github.com/${escape(repo)}">Read it on GitHub.</a></p>`;
  }
  return card;
}

async function mods() {
  const host = document.getElementById('mod-list');
  try {
    const res = await fetch('mods.json', { cache: 'no-cache' });
    const { mods: list } = await res.json();
    const cards = await Promise.all(list.map(renderMod));
    host.replaceChildren(...cards);
  } catch {
    host.innerHTML = '<p class="error">Could not load the mod list.</p>';
  }
}

function guides() {
  const tabs = document.getElementById('guide-tabs');
  const body = document.getElementById('guide-body');

  const show = async (i) => {
    [...tabs.children].forEach((b, n) => b.setAttribute('aria-selected', String(n === i)));
    body.innerHTML = '<p class="loading">Loading&hellip;</p>';
    try {
      body.innerHTML = await guide(GUIDES[i].file);
    } catch {
      body.innerHTML = `<p class="error">Could not load this guide. <a href="https://github.com/${SELF}/blob/master/${GUIDES[i].file}">Read it on GitHub.</a></p>`;
    }
  };

  GUIDES.forEach((g, i) => {
    const b = el(`<button class="tab" type="button" aria-selected="false">${escape(g.label)}</button>`);
    b.addEventListener('click', () => show(i));
    tabs.append(b);
  });

  show(0);
}

mods();
guides();
