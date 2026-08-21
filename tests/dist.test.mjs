import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const BASE = '/lwf-modding';

// Redirect stubs from the old flat site: <meta http-equiv="refresh"> only, no
// heading of their own. Exempt from the one-h1 rule by design.
const REDIRECT_STUBS = new Set(['mods.html', 'guides.html', 'mod.html', 'guide.html']);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const files = await walk(DIST);
const pages = files.filter((f) => f.endsWith('.html'));
// The API check looks wider than the HTML: Astro hoists component <script> tags
// into dist/_astro/*.js, which is where a runtime GitHub call would actually land.
const scannable = files.filter((f) => /\.(html|js|mjs|json|css)$/.test(f));
const read = async (f) => ({ path: relative(DIST, f), html: await readFile(f, 'utf8') });
const docs = await Promise.all(pages.map(read));

test('the site was built', () => {
  assert.ok(pages.length > 0, 'dist/ contains no HTML — run `npm run build` first');
});

test('no page calls the GitHub API at runtime', async () => {
  const scanned = await Promise.all(
    scannable.map(async (f) => ({ path: relative(DIST, f), text: await readFile(f, 'utf8') })),
  );
  const offenders = scanned.filter((d) => d.text.includes('api.github.com')).map((d) => d.path);
  assert.deepEqual(offenders, [], 'these files would hit the GitHub API in a browser');
});

test('every page has exactly one h1', () => {
  const offenders = docs
    .filter((d) => !REDIRECT_STUBS.has(d.path))
    .map((d) => [d.path, (d.html.match(/<h1[\s>]/g) ?? []).length])
    .filter(([, n]) => n !== 1);
  assert.deepEqual(offenders, [], 'pages whose <h1> count is not 1');
});

test('every internal link resolves to a built file', () => {
  const built = new Set(files.map((f) => '/' + relative(DIST, f).replaceAll('\\', '/')));
  const broken = [];
  for (const { path, html } of docs) {
    for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const raw = m[1];
      // A root-absolute link that skips the base is the defect href() exists to
      // prevent: it works in `astro dev` and 404s under the project path.
      if (raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith(BASE + '/') && raw !== BASE) {
        broken.push(`${path} -> ${raw} (absolute link missing base)`);
        continue;
      }
      if (!raw.startsWith(BASE + '/')) continue;
      const clean = raw.slice(BASE.length).split(/[?#]/)[0];
      const candidates = clean.endsWith('/') ? [clean + 'index.html'] : [clean, clean + '/index.html'];
      if (!candidates.some((c) => built.has(c))) broken.push(`${path} -> ${raw}`);
    }
  }
  assert.deepEqual(broken, [], 'internal links pointing at files that were not built');
});
