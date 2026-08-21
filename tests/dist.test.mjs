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

test('every guide is built as its own route', () => {
  for (const slug of ['first-mod', 'reference', 'agents']) {
    assert.ok(
      docs.some((d) => d.path === `guides/${slug}/index.html`),
      `guides/${slug}/index.html was not built`,
    );
  }
});

test('guide bodies are in the HTML, not fetched', () => {
  const firstMod = docs.find((d) => d.path === 'guides/first-mod/index.html');
  // Shiki splits highlighted code into a <span> per token, so the phrase itself
  // is never contiguous in the markup even though every token is present —
  // strip tags before matching so this checks the rendered text, not the markup.
  const text = firstMod.html.replace(/<[^>]+>/g, '');
  assert.ok(text.includes('dotnet new classlib'), 'guide body is missing from the built page');
});

test('cross-guide markdown links are rewritten to routes', () => {
  const firstMod = docs.find((d) => d.path === 'guides/first-mod/index.html');
  assert.ok(!/href="[^"]*\.md"/.test(firstMod.html), 'a raw .md href survived into the built page');
});

test('headings carry ids and anchor affordances', () => {
  const reference = docs.find((d) => d.path === 'guides/reference/index.html');
  assert.match(reference.html, /<h2 id="[^"]+"/, 'headings have no ids');
  assert.match(reference.html, /class="anchor"/, 'headings have no anchor affordance');
});

test('each mod page offers the permanent-redirect download', () => {
  const mod = docs.find((d) => d.path === 'mods/custom-difficulty/index.html');
  assert.ok(mod, 'mods/custom-difficulty/index.html was not built');
  assert.match(
    mod.html,
    /https:\/\/github\.com\/meowous3\/lwf-custom-difficulty\/releases\/latest\/download\/LwfCustomDifficulty\.dll/,
    'the download link is not the permanent redirect',
  );
});

test('the Proton launch option is on the install page', () => {
  const install = docs.find((d) => d.path === 'install/index.html');
  assert.ok(install, 'install/index.html was not built');
  assert.match(install.html, /WINEDLLOVERRIDES/, 'the launch option is missing from /install/');
});

test('the install steps are not duplicated in the developer guide', () => {
  const firstMod = docs.find((d) => d.path === 'guides/first-mod/index.html');
  assert.ok(
    !firstMod.html.includes('WINEDLLOVERRIDES'),
    'the launch option is still duplicated in guides/first-mod',
  );
});
