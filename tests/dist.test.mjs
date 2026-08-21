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

const styles = files.filter((f) => f.endsWith('.css'));
const css = (await Promise.all(styles.map((f) => readFile(f, 'utf8')))).join('\n');

test('body background is painted explicitly, in both schemes', () => {
  assert.match(css, /prefers-color-scheme:\s*dark/, 'no dark scheme is defined');
  assert.match(css, /--ground:/, 'the ground token is missing');
  assert.match(css, /body\{[^}]*background/, 'body has no explicit background');
});

test('every colour token is defined outside a media query', () => {
  // A token that exists only inside `@media (prefers-color-scheme: dark)` has no
  // value at all in the default scheme. Strip every media block, then check that
  // each token the dark block redefines is still declared in what remains.
  const outside = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const declared = new Set([...outside.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const inMedia = [...css.matchAll(/@media[^{]*prefers-color-scheme[^{]*\{([\s\S]*?)\n\}/g)]
    .flatMap((m) => [...m[1].matchAll(/(--[a-z0-9-]+)\s*:/g)].map((t) => t[1]));
  const orphans = [...new Set(inMedia)].filter((t) => !declared.has(t));
  assert.deepEqual(orphans, [], 'tokens that exist only inside a media query');
});

test('the fonts are self-hosted — the built site never calls Google', async () => {
  const scanned = await Promise.all(
    scannable.map(async (f) => ({ path: relative(DIST, f), text: await readFile(f, 'utf8') })),
  );
  const offenders = scanned
    .filter((d) => /fonts\.(googleapis|gstatic)\.com|\/\/[^"']*google/.test(d.text))
    .map((d) => d.path);
  assert.deepEqual(offenders, [], 'these files would fetch a font from Google');
  // Astro inlines the @font-face block into each page's <head>, not into a
  // stylesheet, so this looks at the HTML.
  const install = docs.find((d) => d.path === 'install/index.html');
  assert.match(
    install.html,
    /@font-face\{[^}]*src:url\("\/lwf-modding\/_astro\/fonts\/[^"]+\.woff2"\)/,
    'no self-hosted @font-face was emitted',
  );
});

test('code blocks carry both Shiki palettes and the CSS consumes them', () => {
  const guide = docs.find((d) => d.path === 'guides/first-mod/index.html');
  assert.match(guide.html, /--shiki-light:#[0-9a-fA-F]{3,8}/, 'no light palette on the tokens');
  assert.match(guide.html, /--shiki-dark:#[0-9a-fA-F]{3,8}/, 'no dark palette on the tokens');
  assert.match(css, /color:var\(--shiki-light\)/, 'the CSS never reads --shiki-light');
  assert.match(css, /color:var\(--shiki-dark\)/, 'the CSS never reads --shiki-dark');
});

test('long lines scroll inside the code block, not the page', () => {
  assert.match(css, /\.prose pre\{[^}]*overflow-x:auto/, '.prose pre does not scroll its own overflow');
  assert.match(css, /\.prose table\{[^}]*overflow-x:auto/, '.prose table does not scroll its own overflow');
});

test('every guide page carries the full guide list and its own headings', () => {
  const guide = docs.find((d) => d.path === 'guides/first-mod/index.html');
  assert.match(guide.html, /Modding reference/, 'the sidebar does not list sibling guides');
  assert.match(guide.html, /class="toc/, 'the guide has no table of contents');
});

test('guides link to their neighbours', () => {
  const guide = docs.find((d) => d.path === 'guides/reference/index.html');
  assert.match(guide.html, /rel="prev"/, 'no previous link');
  assert.match(guide.html, /rel="next"/, 'no next link');
});

test('the home page leads with mods and points at install', () => {
  const home = docs.find((d) => d.path === 'index.html');
  assert.match(home.html, /Custom Difficulty/, 'the home page does not list the mods');
  assert.match(home.html, /\/lwf-modding\/install\//, 'the home page does not point at install');
});

test('every mod summary renders on the home page — none depends on a null GitHub description', async () => {
  // The defect this replaces: the old site rendered mod cards from a GitHub API
  // `description` field, which is `null` for this repo, so the card's summary
  // silently came out empty. A negative "no empty <p class=summary>" assertion
  // can never catch that regression: Astro scoped styles append a hash to the
  // class attribute (`class="summary astro-XXXXXXXX"`), so a literal
  // `class="summary"` never matches in the first place and the assertion always
  // passes, defect or not. Assert positively instead: every mod's own summary
  // text must actually appear on the built home page.
  //
  // This runs under the plain Node test runner, not Astro, so `astro:content`
  // (a virtual module Astro's own build resolves) is not importable here — read
  // the same source frontmatter the `mods` collection loads instead.
  const home = docs.find((d) => d.path === 'index.html');
  const modsDir = new URL('../mods/', import.meta.url);
  const files = (await readdir(modsDir)).filter((f) => f.endsWith('.md'));
  assert.ok(files.length > 0, 'the mods/ directory is empty');
  for (const file of files) {
    const raw = await readFile(new URL(file, modsDir), 'utf8');
    const match = raw.match(/^summary:\s*(.+)$/m);
    assert.ok(match, `${file} has no summary in its frontmatter`);
    const summary = match[1].trim().replace(/^"(.*)"$/, '$1');
    assert.ok(
      home.html.includes(summary),
      `home page is missing the summary from ${file}: ${JSON.stringify(summary)}`,
    );
  }
});
