# LWF Modding Site Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace a JavaScript shell that fetches all its content from `api.github.com` at page load with a statically built Astro site that ships real HTML, organised mods-first with one canonical install page.

**Architecture:** Astro 7 static build, content in Markdown at the repository root loaded by the `glob()` content loader, deployed to GitHub Pages by an Action. Downloads use GitHub's permanent `releases/latest/download/` redirect so the running site never calls the API. Two small Sätteri hast plugins fix cross-guide links and heading anchors.

**Tech Stack:** Astro 7.2.4, Sätteri (Astro 7's default Markdown processor), Shiki (built in), zod 4 (via `astro:content`), `node --test` for verification.

**Spec:** `docs/superpowers/specs/2026-08-21-lwf-modding-site-design.md`

## Global Constraints

- **Node >= 22.12.0.** Astro 7.2.4's `engines` field requires it. Verify with `node -v` before starting.
- **`base` is `/lwf-modding`.** This is a GitHub Pages *project* site. Every internal link must go through `href()` from `src/lib/url.ts`. A literal `href="/mods/"` works in `astro dev` and 404s in production — that class of bug must be impossible by construction.
- **Never call `api.github.com` from a page.** Build-time lookups in `src/lib/release.ts` are the only permitted API use. `tests/dist.test.mjs` enforces this.
- **Do not use `markdown.remarkPlugins` or `markdown.rehypePlugins`.** In Astro 7 these are the legacy path, require installing `@astrojs/markdown-remark`, and emit a deprecation warning. Use `markdown.processor: satteri({ hastPlugins: [...] })`.
- **Do not add `rehype-slug`.** Sätteri emits heading `id`s natively and they match `render()`'s `headings` slugs.
- **Exactly one `<h1>` per page.** The old site printed every title twice. `tests/dist.test.mjs` enforces this.
- **Copy rule:** no explanatory prose next to a control. A card or button is label, value, action. Descriptive sentences belong in guide content, never in chrome.
- **Commit after every task.** Do not batch.

**One deliberate divergence from the spec's repository shape:** the spec lists a
`src/layouts/Mod.astro`. It is not built. Mod pages are single-column like `/install/` and use
`Base.astro` directly, so a third layout would hold nothing. If mod pages later grow a sidebar,
add it then.

---

### Task 1: Scaffold the project and the verification harness

The harness comes first because the defects it checks for are the reason for the rebuild. It must be able to fail before there is anything to pass.

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `.gitignore`
- Create: `src/lib/url.ts`
- Create: `src/pages/index.astro` (placeholder, replaced in Task 8)
- Test: `tests/dist.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `href(path: string): string` from `src/lib/url.ts` — prefixes `import.meta.env.BASE_URL`, collapses duplicate slashes, always returns a trailing slash for directory routes. Every later task uses it.

- [ ] **Step 1: Initialise and install**

```bash
npm init -y
npm pkg set name="lwf-modding" version="1.0.0" type="module" private=true
npm pkg delete main scripts.test
npm i astro@7.2.4
```

- [ ] **Step 2: Write `.gitignore`**

```
node_modules/
dist/
.astro/
.DS_Store
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 4: Write `src/lib/url.ts`**

```ts
const BASE = import.meta.env.BASE_URL;

/** Prefix an internal path with the Pages base path. Always use this for internal links. */
export function href(path: string): string {
  const joined = `${BASE}/${path}`.replace(/\/{2,}/g, '/');
  if (joined.includes('.') || joined.endsWith('/')) return joined;
  return `${joined}/`;
}
```

- [ ] **Step 5: Write the failing test**

`tests/dist.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const BASE = '/lwf-modding';

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
const read = async (f) => ({ path: relative(DIST, f), html: await readFile(f, 'utf8') });
const docs = await Promise.all(pages.map(read));

test('the site was built', () => {
  assert.ok(pages.length > 0, 'dist/ contains no HTML — run `npm run build` first');
});

test('no page calls the GitHub API at runtime', () => {
  const offenders = docs.filter((d) => d.html.includes('api.github.com')).map((d) => d.path);
  assert.deepEqual(offenders, [], 'these pages would hit the GitHub API in a browser');
});

test('every page has exactly one h1', () => {
  const offenders = docs
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
      if (!raw.startsWith(BASE + '/')) continue;
      const clean = raw.slice(BASE.length).split(/[?#]/)[0];
      const candidates = clean.endsWith('/') ? [clean + 'index.html'] : [clean, clean + '/index.html'];
      if (!candidates.some((c) => built.has(c))) broken.push(`${path} -> ${raw}`);
    }
  }
  assert.deepEqual(broken, [], 'internal links pointing at files that were not built');
});
```

- [ ] **Step 6: Write `astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://meowous3.github.io',
  base: '/lwf-modding',
  markdown: {
    shikiConfig: {
      themes: { light: 'min-light', dark: 'monokai' },
      defaultColor: false,
    },
  },
});
```

- [ ] **Step 7: Write the placeholder page**

`src/pages/index.astro`:

```astro
---
import { href } from '../lib/url';
---
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Lazy Witch's Factory — modding</title></head>
  <body>
    <h1>Lazy Witch&rsquo;s Factory modding</h1>
    <a href={href('guides')}>Guides</a>
  </body>
</html>
```

- [ ] **Step 8: Wire the scripts and run the harness against no build**

```bash
npm pkg set scripts.dev="astro dev" scripts.build="astro build" scripts.check="node --test tests/" scripts.test="astro build && node --test tests/"
node --test tests/
```

Expected: FAIL — `dist/` does not exist, so `walk()` throws `ENOENT`. This proves the harness reads real output rather than passing vacuously.

- [ ] **Step 9: Build and re-run**

```bash
npm test
```

Expected: PASS, 4 tests. The `guides` link does not yet exist, so if the link test fails here, that is correct — remove the `<a>` from the placeholder, rebuild, and confirm PASS.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json astro.config.mjs tsconfig.json .gitignore src tests
git commit -m "build: scaffold Astro 7 with a dist verification harness"
```

---

### Task 2: Guides as a content collection

**Files:**
- Create: `src/content.config.ts`
- Rename: `guides/GETTING-STARTED.md` → `guides/first-mod.md`, `guides/MODDING.md` → `guides/reference.md`, `guides/AGENTS.md` → `guides/agents.md`
- Modify: the frontmatter of all three
- Create: `src/pages/guides/[slug].astro`, `src/pages/guides/index.astro`
- Test: `tests/dist.test.mjs` (append)

**Interfaces:**
- Consumes: `href()` from Task 1.
- Produces: a `guides` collection whose entries have `id` (the filename without extension, used as the route slug) and `data: { title: string; blurb: string; order: number }`. Tasks 5, 6 and 8 read it via `getCollection('guides')`.

- [ ] **Step 1: Rename the files, preserving history**

```bash
git mv guides/GETTING-STARTED.md guides/first-mod.md
git mv guides/MODDING.md guides/reference.md
git mv guides/AGENTS.md guides/agents.md
```

- [ ] **Step 2: Add frontmatter**

Prepend to `guides/first-mod.md`, and delete its existing `# Your first mod` line so the title is not rendered twice:

```yaml
---
title: Your first mod
blurb: From nothing to a plugin you can see working — project, patch, log, iterate.
order: 1
---
```

Prepend to `guides/reference.md`, deleting its `# Notes on the game` line:

```yaml
---
title: Modding reference
blurb: What the game is made of and where it gives way — architecture, the seams worth patching, and the traps found the hard way.
order: 2
---
```

Prepend to `guides/agents.md`, deleting its `# Agent guide: modding Lazy Witch's Factory` line:

```yaml
---
title: Agent protocol
blurb: The same ground as a working protocol — verify targets by reflection, measure before patching, log applied values.
order: 3
---
```

- [ ] **Step 3: Write `src/content.config.ts`**

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const guides = defineCollection({
  loader: glob({ pattern: '*.md', base: './guides' }),
  schema: z.object({
    title: z.string(),
    blurb: z.string(),
    order: z.number(),
  }),
});

export const collections = { guides };
```

- [ ] **Step 4: Write the failing test**

Append to `tests/dist.test.mjs`:

```js
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
  assert.ok(firstMod.html.includes('dotnet new classlib'), 'guide body is missing from the built page');
});
```

- [ ] **Step 5: Run it and watch it fail**

```bash
npm test
```

Expected: FAIL — `guides/first-mod/index.html was not built`.

- [ ] **Step 6: Write the guide route**

`src/pages/guides/[slug].astro`:

```astro
---
import { getCollection, render } from 'astro:content';

export async function getStaticPaths() {
  const guides = await getCollection('guides');
  return guides.map((guide) => ({ params: { slug: guide.id }, props: { guide } }));
}

const { guide } = Astro.props;
const { Content } = await render(guide);
---
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>{guide.data.title}</title></head>
  <body>
    <h1>{guide.data.title}</h1>
    <Content />
  </body>
</html>
```

- [ ] **Step 7: Write the guides index**

`src/pages/guides/index.astro`:

```astro
---
import { getCollection } from 'astro:content';
import { href } from '../../lib/url';

const guides = (await getCollection('guides')).sort((a, b) => a.data.order - b.data.order);
---
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Guides — Lazy Witch's Factory modding</title></head>
  <body>
    <h1>Guides</h1>
    <ul>
      {guides.map((g) => (
        <li>
          <a href={href(`guides/${g.id}`)}>{g.data.title}</a>
          <p>{g.data.blurb}</p>
        </li>
      ))}
    </ul>
  </body>
</html>
```

- [ ] **Step 8: Run the tests**

```bash
npm test
```

Expected: PASS, 6 tests.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: load guides as a content collection with real routes"
```

---

### Task 3: Sätteri hast plugins for cross-guide links and heading anchors

Fixes the defect where `[the reference](reference.md)` renders as a link to `/MODDING.md` and 404s. The rewrite happens at build time so the Markdown stays correct when read raw on github.com.

**Files:**
- Create: `src/lib/markdown-plugins.mjs`
- Modify: `astro.config.mjs`
- Test: `tests/markdown-plugins.test.mjs` (new), `tests/dist.test.mjs` (append)

**Interfaces:**
- Consumes: nothing.
- Produces: `guideLinks(base: string)` and `headingAnchors()`, both returning a Sätteri hast plugin object of the shape `{ name, element: { filter: string[], visit(node, ctx) } }`. A `visit` that returns a node replaces it; returning nothing leaves it alone.

- [ ] **Step 1: Write the failing unit test**

`tests/markdown-plugins.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guideLinks } from '../src/lib/markdown-plugins.mjs';

const visit = guideLinks('/lwf-modding').element.visit;
const anchor = (href) => ({ type: 'element', tagName: 'a', properties: { href }, children: [] });

test('rewrites a bare .md link to its guide route', () => {
  assert.equal(visit(anchor('reference.md')).properties.href, '/lwf-modding/guides/reference/');
});

test('preserves a fragment', () => {
  assert.equal(visit(anchor('reference.md#seams')).properties.href, '/lwf-modding/guides/reference/#seams');
});

test('leaves external links alone', () => {
  assert.equal(visit(anchor('https://example.com/a.md')), undefined);
});

test('leaves in-page fragments alone', () => {
  assert.equal(visit(anchor('#traps')), undefined);
});

test('keeps other properties', () => {
  const node = { ...anchor('reference.md'), properties: { href: 'reference.md', title: 'x' } };
  assert.equal(visit(node).properties.title, 'x');
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --test tests/markdown-plugins.test.mjs
```

Expected: FAIL — `Cannot find module '../src/lib/markdown-plugins.mjs'`.

- [ ] **Step 3: Write the plugins**

`src/lib/markdown-plugins.mjs`:

```js
// Guide Markdown is authored to read correctly on github.com, where a sibling guide is
// `reference.md`. On the site the same guide lives at /guides/reference/, so the hrefs are
// rewritten at build time rather than the prose being written for one reader and broken
// for the other.
const SIBLING_MD = /^([A-Za-z0-9._-]+)\.md(#.*)?$/;

export function guideLinks(base) {
  return {
    name: 'guide-links',
    element: {
      filter: ['a'],
      visit(node) {
        const href = node.properties?.href;
        if (typeof href !== 'string') return;
        const match = SIBLING_MD.exec(href);
        if (!match) return;
        const [, slug, fragment = ''] = match;
        return {
          ...node,
          properties: { ...node.properties, href: `${base}/guides/${slug}/${fragment}` },
        };
      },
    },
  };
}

export function headingAnchors() {
  return {
    name: 'heading-anchors',
    element: {
      filter: ['h2', 'h3'],
      visit(node) {
        const id = node.properties?.id;
        if (typeof id !== 'string' || !id) return;
        return {
          ...node,
          children: [
            ...node.children,
            {
              type: 'element',
              tagName: 'a',
              properties: { href: `#${id}`, class: 'anchor', 'aria-label': 'Link to this section' },
              children: [{ type: 'text', value: '#' }],
            },
          ],
        };
      },
    },
  };
}
```

- [ ] **Step 4: Run the unit test**

```bash
node --test tests/markdown-plugins.test.mjs
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Install the Sätteri processor package and wire it up**

```bash
npm i @astrojs/markdown-satteri
```

Replace the `markdown` block in `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import { guideLinks, headingAnchors } from './src/lib/markdown-plugins.mjs';

const BASE = '/lwf-modding';

export default defineConfig({
  site: 'https://meowous3.github.io',
  base: BASE,
  markdown: {
    processor: satteri({ hastPlugins: [guideLinks(BASE), headingAnchors()] }),
    shikiConfig: {
      themes: { light: 'min-light', dark: 'monokai' },
      defaultColor: false,
    },
  },
});
```

- [ ] **Step 6: Add the build-level assertion**

Append to `tests/dist.test.mjs`:

```js
test('cross-guide markdown links are rewritten to routes', () => {
  const firstMod = docs.find((d) => d.path === 'guides/first-mod/index.html');
  assert.ok(!/href="[^"]*\.md"/.test(firstMod.html), 'a raw .md href survived into the built page');
});

test('headings carry ids and anchor affordances', () => {
  const reference = docs.find((d) => d.path === 'guides/reference/index.html');
  assert.match(reference.html, /<h2 id="[^"]+"/, 'headings have no ids');
  assert.match(reference.html, /class="anchor"/, 'headings have no anchor affordance');
});
```

- [ ] **Step 7: Run everything**

```bash
npm test
```

Expected: PASS. The internal-link test from Task 1 now also covers the rewritten hrefs, so a wrong slug fails the build check rather than shipping.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "fix: rewrite cross-guide .md links and add heading anchors at build time"
```

---

### Task 4: Mods, and downloads that never call the API

**Files:**
- Create: `mods/custom-difficulty.md`
- Create: `src/lib/release.ts`
- Modify: `src/content.config.ts`
- Create: `src/pages/mods/[slug].astro`
- Delete: `mods.json`
- Test: `tests/release.test.mjs` (new), `tests/dist.test.mjs` (append)

**Interfaces:**
- Consumes: `href()` from Task 1.
- Produces:
  - a `mods` collection with `data: { title, repo, dll, summary, gameVersion, version? }`
  - `downloadUrl(repo: string, dll: string): string` — the permanent redirect URL, no API
  - `latestTag(repo: string, fallback?: string): Promise<string | null>` — build-time only, memoised, returns `fallback ?? null` on any failure

- [ ] **Step 1: Write the mod content file**

`mods/custom-difficulty.md`. The body is authored here rather than pulled from the mod's README — see the tradeoff note in the spec.

```markdown
---
title: Custom Difficulty
repo: meowous3/lwf-custom-difficulty
dll: LwfCustomDifficulty.dll
summary: A difficulty whose time limit, repayments, growth curve and taxes you set in-game.
gameVersion: "0.21.0"
version: v0.2.0
---

Adds a **Custom** difficulty whose time limit, repayment count, repayment curve and taxes are
set from the difficulty selection screen. It is the leftmost card in the difficulty carousel.

Custom runs pay `x0.00` and write nothing to your save. Nothing done in one is earned — the
run's own settings decide what winning takes, and one repayment of one coin is a legal
configuration — so no progress of any kind is recorded: no cleared difficulty, no unlock
notice, no patron clears, no biome, no adventure progress, and no entry in run history.

## Options

| Row | Accepts | Default |
|---|---|---|
| Time Limit | minutes, `0` = none | 30 |
| Repayments | ≥ 1 | 5 |
| First Repayment | ≥ 1 | 10 |
| Growth | Linear / Multiplicative / Exponential | Linear |
| Growth Amount | ≥ 0, decimals allowed | 20 |
| Surcharge | ≥ 0, `0` = off | 500 |
| Surcharge Every | ≥ 1 | 5 |
| Taxes | on / off | off |

Edits apply to the next run. Values persist in
`BepInEx/config/dev.meow.lwfcustomdifficulty.cfg`.

## Growth

The first demand is **First Repayment**. Each one after that:

```
Linear          target += GrowthAmount
Multiplicative  target *= GrowthAmount
Exponential     target += FirstRepayment × GrowthAmount^n
```

then `+= Surcharge` whenever `n` divides evenly by **Surcharge Every**.

In Exponential, Growth Amount is the acceleration: every step is the one before it times that
number. A multiplier below `1` holds the curve flat rather than reducing it. Targets cap at
`536870911`.
```

- [ ] **Step 2: Write the failing unit test**

`tests/release.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadUrl } from '../src/lib/release.ts';

test('the download URL is the permanent redirect, not an API call', () => {
  const url = downloadUrl('meowous3/lwf-custom-difficulty', 'LwfCustomDifficulty.dll');
  assert.equal(url, 'https://github.com/meowous3/lwf-custom-difficulty/releases/latest/download/LwfCustomDifficulty.dll');
  assert.ok(!url.includes('api.github.com'));
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
node --test tests/release.test.mjs
```

Expected: FAIL — module not found.

- [ ] **Step 4: Write `src/lib/release.ts`**

```ts
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
```

- [ ] **Step 5: Run the unit test**

```bash
node --test tests/release.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Add the mods collection**

Replace `src/content.config.ts`:

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const guides = defineCollection({
  loader: glob({ pattern: '*.md', base: './guides' }),
  schema: z.object({
    title: z.string(),
    blurb: z.string(),
    order: z.number(),
  }),
});

const mods = defineCollection({
  loader: glob({ pattern: '*.md', base: './mods' }),
  schema: z.object({
    title: z.string(),
    repo: z.string(),
    dll: z.string(),
    summary: z.string(),
    gameVersion: z.string(),
    version: z.string().optional(),
  }),
});

export const collections = { guides, mods };
```

- [ ] **Step 7: Write the failing build assertion**

Append to `tests/dist.test.mjs`:

```js
test('each mod page offers the permanent-redirect download', () => {
  const mod = docs.find((d) => d.path === 'mods/custom-difficulty/index.html');
  assert.ok(mod, 'mods/custom-difficulty/index.html was not built');
  assert.match(
    mod.html,
    /https:\/\/github\.com\/meowous3\/lwf-custom-difficulty\/releases\/latest\/download\/LwfCustomDifficulty\.dll/,
    'the download link is not the permanent redirect',
  );
});
```

- [ ] **Step 8: Run it and watch it fail**

```bash
npm test
```

Expected: FAIL — the mod page was not built.

- [ ] **Step 9: Write the mod route**

`src/pages/mods/[slug].astro`:

```astro
---
import { getCollection, render } from 'astro:content';
import { downloadUrl, latestTag } from '../../lib/release';

export async function getStaticPaths() {
  const mods = await getCollection('mods');
  return mods.map((mod) => ({ params: { slug: mod.id }, props: { mod } }));
}

const { mod } = Astro.props;
const { Content } = await render(mod);
const tag = await latestTag(mod.data.repo, mod.data.version);
---
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>{mod.data.title}</title></head>
  <body>
    <h1>{mod.data.title}</h1>
    <p>{mod.data.summary}</p>
    <a href={downloadUrl(mod.data.repo, mod.data.dll)} download>
      Download{tag ? ` ${tag}` : ''}
    </a>
    <a href={`https://github.com/${mod.data.repo}`}>Source</a>
    <Content />
  </body>
</html>
```

- [ ] **Step 10: Run the tests, then delete the dead manifest**

```bash
npm test
git rm mods.json
npm test
```

Expected: PASS both times.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: mods as content, with downloads that never call the API"
```

---

### Task 5: The install page, and splitting it out of the developer guide

The substantive content change. The Proton launch option currently exists only inside a guide titled "Your first mod"; after this task it is on the page a player reaches.

**Files:**
- Create: `pages/install.md`
- Create: `src/pages/install.astro`
- Modify: `guides/first-mod.md` (remove §1–3, renumber, link to `/install/`)
- Modify: `src/content.config.ts`
- Test: `tests/dist.test.mjs` (append)

**Interfaces:**
- Consumes: `href()` from Task 1, the `guides` collection from Task 2.
- Produces: a `pages` collection (single entry, `install`) rendered by `src/pages/install.astro`.

- [ ] **Step 1: Write the failing test**

Append to `tests/dist.test.mjs`:

```js
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
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test
```

Expected: FAIL — `install/index.html was not built`.

- [ ] **Step 3: Write `pages/install.md`**

Note the ordering change from the old guide: the launch option moves *before* the first run, because running the game first without it produces no log and no error.

```markdown
---
title: Installing mods
summary: BepInEx, the launch option, and where the .dll goes.
---

Every mod here is a **BepInEx 5** plugin. Set BepInEx up once and every mod is a file you drop
in a folder.

## 1. Install BepInEx

Download **[BepInEx 5.4.23.5, `win_x64`](https://github.com/BepInEx/BepInEx/releases/tag/v5.4.23.5)**
and extract it into the game folder — the one with the `.exe` in it, not a subfolder.

Take the Windows build even on Linux. The game runs under Proton, so it is a Windows process.

Right afterwards the folder contains:

```
LazyWitchsFactory.exe
winhttp.dll
doorstop_config.ini
BepInEx/
```

**Version matters.** BepInEx 6 is a different loader with a different API. Every mod here
assumes 5.

## 2. On Linux, set the launch option

Right-click the game in Steam → Properties → Launch Options:

```
WINEDLLOVERRIDES="winhttp=n,b" %command%
```

Without it Proton ignores `winhttp.dll` and **nothing loads, with no error** — the game just
runs unmodded. This is the single most common reason a mod appears to do nothing.

## 3. Run the game once

Start it, reach the title screen, quit. BepInEx generates its folders on first run:

```
BepInEx/config/     BepInEx/core/     BepInEx/plugins/     BepInEx/LogOutput.log
```

Check it loaded:

```bash
grep "Chainloader started" "<game>/BepInEx/LogOutput.log"
```

A hit means BepInEx is running. No `LogOutput.log` at all on Linux means step 2 was missed.

## 4. Install the mod

Put its `.dll` in `BepInEx/plugins/`. That is the whole installation. Start the game.

## Nothing happened

In order of likelihood:

1. **On Linux, the launch option is missing.** No `LogOutput.log` at all is the tell.
2. **BepInEx went into a subfolder.** `winhttp.dll` has to sit beside `LazyWitchsFactory.exe`.
3. **BepInEx 6 instead of 5.** The plugin will not load against a different API.
4. **The `.dll` is not in `BepInEx/plugins/`.**

If `LogOutput.log` exists, open it — a plugin that failed to load says so by name.

## Uninstalling

Delete the mod's `.dll` from `BepInEx/plugins/`. To remove BepInEx entirely, delete
`winhttp.dll`, `doorstop_config.ini` and the `BepInEx/` folder, and clear the launch option.
```

- [ ] **Step 4: Add the `pages` collection**

Append the collection to `src/content.config.ts` and add it to the export:

```ts
const pages = defineCollection({
  loader: glob({ pattern: '*.md', base: './pages' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
  }),
});

export const collections = { guides, mods, pages };
```

- [ ] **Step 5: Write `src/pages/install.astro`**

```astro
---
import { getEntry, render } from 'astro:content';

const install = await getEntry('pages', 'install');
if (!install) throw new Error('pages/install.md is missing');
const { Content } = await render(install);
---
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>{install.data.title}</title></head>
  <body>
    <h1>{install.data.title}</h1>
    <Content />
  </body>
</html>
```

- [ ] **Step 6: Cut §1–3 out of the developer guide**

`guides/first-mod.md` currently has ten `##` sections. Delete sections 1, 2 and 3 outright,
keeping only the `BepInEx.cfg` logging paragraph out of section 3 (it is developer-specific and
moves into the preamble, below). Then renumber what remains so the heading list is exactly:

```
## 1. Make a project          (was 4)
## 2. Write the plugin        (was 5)
## 3. Build and install       (was 6)
## 4. Check it loaded         (was 7)
## 5. Change something        (was 8)
## 6. Find your own targets   (was 9)
## 7. Before you trust it     (was 10)
```

Do not edit the body prose of those seven sections — only their heading numbers. Check for
in-body references to the old numbers (`grep -n 'step [0-9]' guides/first-mod.md`) and update
any that point at a renumbered section.

Replace the opening prerequisites line with:

```markdown
You need the [.NET SDK](https://dotnet.microsoft.com/download) (8 or newer), the game, and
BepInEx already working — see [Installing mods](/lwf-modding/install/) if it is not.

Before you start, open `BepInEx/config/BepInEx.cfg` and set:

```ini
[Logging.Disk]
WriteUnityLog = true
AppendLog = true
```

The first sends the game's own exceptions to your log, which you will want the first time
something throws. The second stops each launch from overwriting the last one's evidence.
```

- [ ] **Step 7: Run the tests**

```bash
npm test
```

Expected: PASS. If the internal-link test fails on `/lwf-modding/install/`, the install route did not build — fix that rather than the link.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: one canonical install page, split out of the developer guide"
```

---

### Task 6: Design tokens and the base layout

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/prose.css`
- Create: `src/components/Ornament.astro`
- Create: `src/layouts/Base.astro`
- Modify: `src/pages/index.astro`, `src/pages/install.astro`, `src/pages/guides/index.astro`, `src/pages/guides/[slug].astro`, `src/pages/mods/[slug].astro`
- Test: `tests/dist.test.mjs` (append)

**Interfaces:**
- Consumes: `href()` from Task 1.
- Produces: `Base.astro`, taking props `{ title: string; description?: string; wide?: boolean }` and a default slot. It renders `<head>`, the nav, the footer, and imports both stylesheets. Every page uses it. `Ornament.astro` takes `{ text: string }` and renders the `◈ text ◈` title with the double rule.

- [ ] **Step 1: Declare the fonts**

Add to `astro.config.mjs`, above `markdown`:

```js
import { fontProviders } from 'astro/config';
```

```js
  fonts: [
    { name: 'Fraunces', cssVariable: '--font-display', provider: fontProviders.google(), weights: [700, 900] },
    { name: 'Nunito Sans', cssVariable: '--font-ui', provider: fontProviders.google(), weights: [400, 600, 800] },
  ],
```

- [ ] **Step 2: Write `src/styles/tokens.css`**

Every colour is defined on bare `:root` first, so no token exists only inside a media query.

```css
:root {
  --ground: #cfc6b8;
  --ground-edge: #b8ae9e;
  --surface: #2b2320;
  --surface-edge: #161110;
  --surface-lip: #3d332c;
  --ink: #3a2c22;
  --ink-inverse: #e8dcc4;
  --muted: #8a7a6a;
  --ember: #9c4430;
  --ember-fill: #3a1c17;
  --gold: #8a5a2b;
  --radius: 10px;
  --measure: 72ch;
}

@media (prefers-color-scheme: dark) {
  :root {
    --ground: #17120e;
    --ground-edge: #100c09;
    --surface: #241d19;
    --surface-edge: #0d0a08;
    --surface-lip: #3d332c;
    --ink: #e8dcc4;
    --muted: #ab9683;
    --gold: #d1b085;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  background: radial-gradient(ellipse at 50% 0%, var(--ground) 0%, var(--ground-edge) 100%);
  background-attachment: fixed;
  color: var(--ink);
  font-family: var(--font-ui), ui-sans-serif, system-ui, sans-serif;
  font-size: 17px;
  line-height: 1.65;
}

/* One rule, so nothing can fall through to browser blue. */
a { color: var(--gold); text-underline-offset: 3px; }
a:hover { color: var(--ember); }

h1, h2, h3 { font-family: var(--font-display), Georgia, serif; font-weight: 900; }

.wrap { max-width: 62rem; margin: 0 auto; padding: 0 1.5rem; }
.measure { max-width: var(--measure); }

.panel {
  background: var(--surface);
  color: var(--ink-inverse);
  border-radius: var(--radius);
  border: 1px solid var(--surface-lip);
  box-shadow: 4px 4px 0 var(--surface-edge);
  padding: 1.25rem 1.5rem;
}
.panel a { color: #d1b085; }

.btn {
  display: inline-block;
  font-family: var(--font-ui), sans-serif;
  font-weight: 800;
  text-decoration: none;
  padding: 0.6rem 1.1rem;
  border-radius: 8px;
  background: var(--ember-fill);
  color: var(--ink-inverse);
  border: 2px solid var(--ember);
  box-shadow: 3px 3px 0 var(--surface-edge);
}
.btn:hover { color: #fff; transform: translate(1px, 1px); box-shadow: 2px 2px 0 var(--surface-edge); }
.btn.ghost { background: var(--surface); border-color: var(--surface-lip); }

nav a { font-weight: 600; text-decoration: none; }
nav a[aria-current='page'] { color: var(--ember); }

footer { margin-top: 4rem; padding: 1.5rem 0; color: var(--muted); font-size: 0.85rem; }
```

- [ ] **Step 3: Write `src/styles/prose.css`**

```css
.prose { max-width: var(--measure); }
.prose h2 { margin-top: 2.5rem; font-size: 1.4rem; }
.prose h3 { margin-top: 2rem; font-size: 1.1rem; font-weight: 700; }

.prose :not(pre) > code {
  background: var(--surface);
  color: var(--ink-inverse);
  padding: 0.1em 0.4em;
  border-radius: 4px;
  font-size: 0.87em;
}

.prose pre {
  background: var(--surface);
  border: 1px solid var(--surface-lip);
  box-shadow: 4px 4px 0 var(--surface-edge);
  border-radius: var(--radius);
  padding: 1rem 1.15rem;
  overflow-x: auto;
  max-width: 100%;
}

/* Shiki emits both palettes as custom properties; pick one per scheme, no JS. */
.prose pre, .prose pre span { color: var(--shiki-light); background-color: var(--shiki-light-bg); }
@media (prefers-color-scheme: dark) {
  .prose pre, .prose pre span { color: var(--shiki-dark); background-color: var(--shiki-dark-bg); }
}

.prose table { border-collapse: collapse; display: block; overflow-x: auto; max-width: 100%; }
.prose th, .prose td { border: 1px solid var(--muted); padding: 0.4rem 0.7rem; text-align: left; }
.prose blockquote { margin: 0; padding-left: 1rem; border-left: 3px solid var(--ember); color: var(--muted); }
.prose img { max-width: 100%; height: auto; }

.prose .anchor {
  margin-left: 0.4rem;
  opacity: 0;
  text-decoration: none;
  font-family: var(--font-ui), sans-serif;
}
.prose h2:hover .anchor, .prose h3:hover .anchor, .prose .anchor:focus { opacity: 0.5; }
```

- [ ] **Step 4: Write `src/components/Ornament.astro`**

```astro
---
interface Props { text: string }
const { text } = Astro.props;
---
<div class="ornament">
  <h1><span aria-hidden="true">◈</span>{text}<span aria-hidden="true">◈</span></h1>
  <div class="rule"><i></i><i></i></div>
</div>

<style>
  .ornament { text-align: center; margin: 2.5rem 0 2rem; }
  h1 { margin: 0; font-size: clamp(2rem, 6vw, 3rem); letter-spacing: -0.01em; }
  h1 span { color: var(--muted); margin: 0 0.6em; font-size: 0.55em; vertical-align: 0.25em; }
  .rule { display: flex; flex-direction: column; align-items: center; gap: 4px; margin-top: 0.75rem; }
  .rule i { display: block; height: 2px; background: var(--muted); }
  .rule i:first-child { width: min(28rem, 80%); }
  .rule i:last-child { width: min(18rem, 55%); }
</style>
```

- [ ] **Step 5: Write `src/layouts/Base.astro`**

The nav carries labels only — no descriptions, no taglines.

```astro
---
import { Font } from 'astro:assets';
import { href } from '../lib/url';
import '../styles/tokens.css';
import '../styles/prose.css';

interface Props { title: string; description?: string }
const { title, description } = Astro.props;

const path = Astro.url.pathname;
const links = [
  { label: 'Mods', to: href('') },
  { label: 'Install', to: href('install') },
  { label: 'Guides', to: href('guides') },
  { label: 'GitHub', to: 'https://github.com/meowous3/lwf-modding' },
];
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    {description && <meta name="description" content={description} />}
    <link rel="icon" href={href('favicon.svg')} />
    <Font cssVariable="--font-display" preload />
    <Font cssVariable="--font-ui" preload />
  </head>
  <body>
    <header>
      <div class="wrap bar">
        <a class="brand" href={href('')}>Lazy Witch&rsquo;s Factory <span>modding</span></a>
        <nav>
          {links.map((l) => (
            <a href={l.to} aria-current={l.to !== href('') && path.startsWith(l.to) ? 'page' : undefined}>{l.label}</a>
          ))}
        </nav>
      </div>
    </header>
    <main class="wrap"><slot /></main>
    <footer class="wrap">
      <p>MIT. Not affiliated with the developers of Lazy Witch&rsquo;s Factory.</p>
    </footer>
  </body>
</html>

<style>
  .bar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; padding: 1rem 1.5rem; }
  .brand { font-family: var(--font-display), Georgia, serif; font-weight: 700; text-decoration: none; color: var(--ink); }
  .brand span { color: var(--muted); font-weight: 400; }
  nav { display: flex; gap: 1.25rem; }
</style>
```

- [ ] **Step 6: Create the favicon**

`public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#2b2320"/><path d="M16 6l7 10-7 10-7-10z" fill="#d1b085"/><circle cx="16" cy="16" r="2.6" fill="#2b2320"/></svg>
```

- [ ] **Step 7: Convert the pages to the layout**

Each page loses its own `<!doctype html>`, `<html>`, `<head>` and `<body>`, wraps its content in
`<Base title={...}>`, and puts rendered Markdown inside `<article class="prose">`.

Convert **`install.astro`** and **`guides/index.astro`** in this task, in full, as shown below.
Leave `guides/[slug].astro`, `mods/[slug].astro` and `index.astro` alone — Task 7 rewrites the
first and Task 8 rewrites the other two, from scratch, and converting them here would be work
thrown away. They keep their bare-HTML form for one more task; the one-`h1` test still passes
because each already renders exactly one.

`src/pages/install.astro` becomes:

```astro
---
import { getEntry, render } from 'astro:content';
import Base from '../layouts/Base.astro';
import Ornament from '../components/Ornament.astro';

const install = await getEntry('pages', 'install');
if (!install) throw new Error('pages/install.md is missing');
const { Content } = await render(install);
---
<Base title={`${install.data.title} — Lazy Witch's Factory modding`} description={install.data.summary}>
  <Ornament text={install.data.title} />
  <article class="prose"><Content /></article>
</Base>
```

And `src/pages/guides/index.astro` becomes:

```astro
---
import { getCollection } from 'astro:content';
import Base from '../../layouts/Base.astro';
import Ornament from '../../components/Ornament.astro';
import { href } from '../../lib/url';

const guides = (await getCollection('guides')).sort((a, b) => a.data.order - b.data.order);
---
<Base title="Guides — Lazy Witch's Factory modding" description="Guides to writing BepInEx mods for Lazy Witch's Factory.">
  <Ornament text="Guides" />
  <div class="grid">
    {guides.map((g) => (
      <article class="panel">
        <h2><a href={href(`guides/${g.id}`)}>{g.data.title}</a></h2>
        <p>{g.data.blurb}</p>
      </article>
    ))}
  </div>
</Base>

<style>
  .grid { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr)); }
  h2 { margin: 0 0 0.5rem; font-size: 1.2rem; }
  h2 a { color: var(--ink-inverse); text-decoration: none; }
  .panel p { margin: 0; color: #c9baa4; }
</style>
```

`Ornament` renders the page's only `<h1>` — no page may add another.

- [ ] **Step 8: Add the theme assertion**

Append to `tests/dist.test.mjs`:

```js
test('body background is painted explicitly, in both schemes', async () => {
  const css = (await Promise.all(
    files.filter((f) => f.endsWith('.css')).map((f) => readFile(f, 'utf8')),
  )).join('\n');
  assert.match(css, /prefers-color-scheme:\s*dark/, 'no dark scheme is defined');
  assert.match(css, /--ground:/, 'the ground token is missing');
});
```

- [ ] **Step 9: Build and look at it**

```bash
npm test
npx astro build && npx serve dist -l 4321 &
chromium-browser --headless --disable-gpu --no-sandbox --virtual-time-budget=6000 \
  --screenshot=/tmp/install.png --window-size=1200,2000 http://localhost:4321/lwf-modding/install/
```

Confirm: parchment ground, dark panels, `◈` title with the double rule, code blocks legible.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: design system and base layout drawn from the game's UI"
```

---

### Task 7: Guide sidebar, table of contents, and prev/next

**Files:**
- Create: `src/components/Sidebar.astro`, `src/components/Toc.astro`, `src/components/PrevNext.astro`
- Create: `src/layouts/Doc.astro`
- Modify: `src/pages/guides/[slug].astro`
- Test: `tests/dist.test.mjs` (append)

**Interfaces:**
- Consumes: the `guides` collection (Task 2), `href()` (Task 1), `Base.astro` (Task 6).
- Produces: `Doc.astro`, taking `{ title: string; description?: string; slug: string; headings: { depth: number; slug: string; text: string }[] }` and a default slot.

- [ ] **Step 1: Write the failing test**

Append to `tests/dist.test.mjs`:

```js
test('every guide page carries the full guide list and its own headings', () => {
  const guide = docs.find((d) => d.path === 'guides/first-mod/index.html');
  assert.match(guide.html, /Modding reference/, 'the sidebar does not list sibling guides');
  assert.match(guide.html, /class="toc"/, 'the guide has no table of contents');
});

test('guides link to their neighbours', () => {
  const guide = docs.find((d) => d.path === 'guides/reference/index.html');
  assert.match(guide.html, /rel="prev"/, 'no previous link');
  assert.match(guide.html, /rel="next"/, 'no next link');
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test
```

Expected: FAIL — the sidebar does not list sibling guides.

- [ ] **Step 3: Write `src/components/Toc.astro`**

```astro
---
interface Props { headings: { depth: number; slug: string; text: string }[] }
const items = Astro.props.headings.filter((h) => h.depth === 2);
---
{items.length > 1 && (
  <nav class="toc" aria-label="On this page">
    <ol>{items.map((h) => <li><a href={`#${h.slug}`}>{h.text}</a></li>)}</ol>
  </nav>
)}

<style>
  .toc ol { list-style: none; margin: 0; padding: 0; }
  .toc a { display: block; padding: 0.15rem 0; font-size: 0.9rem; text-decoration: none; }
</style>
```

- [ ] **Step 4: Write `src/components/Sidebar.astro`**

```astro
---
import { getCollection } from 'astro:content';
import { href } from '../lib/url';
import Toc from './Toc.astro';

interface Props { slug: string; headings: { depth: number; slug: string; text: string }[] }
const { slug, headings } = Astro.props;
const guides = (await getCollection('guides')).sort((a, b) => a.data.order - b.data.order);
---
<nav class="sidebar" aria-label="Guides">
  <ul>
    {guides.map((g) => (
      <li>
        <a href={href(`guides/${g.id}`)} aria-current={g.id === slug ? 'page' : undefined}>{g.data.title}</a>
        {g.id === slug && <Toc headings={headings} />}
      </li>
    ))}
  </ul>
</nav>

<style>
  .sidebar ul { list-style: none; margin: 0; padding: 0; }
  .sidebar > ul > li { margin-bottom: 0.75rem; }
  .sidebar > ul > li > a { font-weight: 800; text-decoration: none; display: block; }
  .sidebar :global(.toc) { margin: 0.25rem 0 0 0.75rem; border-left: 2px solid var(--muted); padding-left: 0.6rem; }
</style>
```

- [ ] **Step 5: Write `src/components/PrevNext.astro`**

```astro
---
import { getCollection } from 'astro:content';
import { href } from '../lib/url';

interface Props { slug: string }
const guides = (await getCollection('guides')).sort((a, b) => a.data.order - b.data.order);
const i = guides.findIndex((g) => g.id === Astro.props.slug);
const prev = guides[i - 1];
const next = guides[i + 1];
---
<nav class="prevnext">
  {prev ? <a rel="prev" href={href(`guides/${prev.id}`)}>&larr; {prev.data.title}</a> : <span />}
  {next && <a rel="next" href={href(`guides/${next.id}`)}>{next.data.title} &rarr;</a>}
</nav>

<style>
  .prevnext { display: flex; justify-content: space-between; gap: 1rem; margin-top: 3rem; padding-top: 1.25rem; border-top: 1px solid var(--muted); }
  .prevnext a { font-weight: 600; text-decoration: none; }
</style>
```

Note: `reference` is `order: 2`, so it has both a prev and a next — which is what the test asserts.

- [ ] **Step 6: Write `src/layouts/Doc.astro`**

Below 900px the sidebar's guide list stays and the TOC moves inline above the content, so the two presentations never appear at once.

```astro
---
import Base from './Base.astro';
import Ornament from '../components/Ornament.astro';
import Sidebar from '../components/Sidebar.astro';
import Toc from '../components/Toc.astro';
import PrevNext from '../components/PrevNext.astro';

interface Props {
  title: string;
  description?: string;
  slug: string;
  headings: { depth: number; slug: string; text: string }[];
}
const { title, description, slug, headings } = Astro.props;
---
<Base title={`${title} — Lazy Witch's Factory modding`} description={description}>
  <Ornament text={title} />
  <div class="doc">
    <aside><Sidebar slug={slug} headings={headings} /></aside>
    <div>
      <div class="inline-toc"><Toc headings={headings} /></div>
      <article class="prose"><slot /></article>
      <PrevNext slug={slug} />
    </div>
  </div>
</Base>

<style>
  .doc { display: grid; grid-template-columns: 15rem minmax(0, 1fr); gap: 3rem; align-items: start; }
  aside { position: sticky; top: 1.5rem; }
  .inline-toc { display: none; }
  @media (max-width: 900px) {
    .doc { grid-template-columns: minmax(0, 1fr); gap: 1.5rem; }
    aside :global(.toc) { display: none; }
    .inline-toc { display: block; margin-bottom: 2rem; }
  }
</style>
```

- [ ] **Step 7: Rewrite the guide route**

`src/pages/guides/[slug].astro`:

```astro
---
import { getCollection, render } from 'astro:content';
import Doc from '../../layouts/Doc.astro';

export async function getStaticPaths() {
  const guides = await getCollection('guides');
  return guides.map((guide) => ({ params: { slug: guide.id }, props: { guide } }));
}

const { guide } = Astro.props;
const { Content, headings } = await render(guide);
---
<Doc title={guide.data.title} description={guide.data.blurb} slug={guide.id} headings={headings}>
  <Content />
</Doc>
```

- [ ] **Step 8: Run the tests**

```bash
npm test
```

Expected: PASS. The one-`h1` test still passes because `Ornament` inside `Doc` is the only `h1`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: guide sidebar, table of contents and prev/next"
```

---

### Task 8: The home page and the mod card

**Files:**
- Create: `src/components/ModCard.astro`
- Modify: `src/pages/index.astro`, `src/pages/mods/[slug].astro`
- Test: `tests/dist.test.mjs` (append)

**Interfaces:**
- Consumes: the `mods` collection (Task 4), `downloadUrl`/`latestTag` (Task 4), `Base.astro` and `Ornament.astro` (Task 6).
- Produces: `ModCard.astro`, taking `{ mod }` — one entry of the `mods` collection.

- [ ] **Step 1: Write the failing test**

Append to `tests/dist.test.mjs`:

```js
test('the home page leads with mods and points at install', () => {
  const home = docs.find((d) => d.path === 'index.html');
  assert.match(home.html, /Custom Difficulty/, 'the home page does not list the mods');
  assert.match(home.html, /\/lwf-modding\/install\//, 'the home page does not point at install');
});

test('no mod is rendered with an empty summary', () => {
  const home = docs.find((d) => d.path === 'index.html');
  assert.ok(!/<p class="summary">\s*<\/p>/.test(home.html), 'a mod card has an empty summary');
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test
```

Expected: FAIL — the home page does not list the mods.

- [ ] **Step 3: Write `src/components/ModCard.astro`**

Label, value, action. The summary is the mod's own one-line description, not a tooltip about the button.

```astro
---
import type { CollectionEntry } from 'astro:content';
import { href } from '../lib/url';
import { downloadUrl, latestTag } from '../lib/release';

interface Props { mod: CollectionEntry<'mods'> }
const { mod } = Astro.props;
const tag = await latestTag(mod.data.repo, mod.data.version);
---
<article class="panel card">
  <div class="head">
    <h2><a href={href(`mods/${mod.id}`)}>{mod.data.title}</a></h2>
    {tag && <span class="tag">{tag}</span>}
  </div>
  <p class="summary">{mod.data.summary}</p>
  <div class="actions">
    <a class="btn" href={downloadUrl(mod.data.repo, mod.data.dll)} download>Download</a>
    <a class="btn ghost" href={href(`mods/${mod.id}`)}>Details</a>
  </div>
</article>

<style>
  .card { display: flex; flex-direction: column; gap: 0.75rem; }
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
  h2 { margin: 0; font-size: 1.25rem; }
  h2 a { color: var(--ink-inverse); text-decoration: none; }
  .tag { font-size: 0.8rem; color: var(--muted); font-variant-numeric: tabular-nums; }
  .summary { margin: 0; color: #c9baa4; }
  .actions { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-top: 0.25rem; }
</style>
```

- [ ] **Step 4: Write the home page**

```astro
---
import { getCollection } from 'astro:content';
import Base from '../layouts/Base.astro';
import Ornament from '../components/Ornament.astro';
import ModCard from '../components/ModCard.astro';
import { href } from '../lib/url';

const mods = (await getCollection('mods')).sort((a, b) => a.data.title.localeCompare(b.data.title));
---
<Base
  title="Lazy Witch's Factory — modding"
  description="BepInEx mods and modding guides for Lazy Witch's Factory."
>
  <Ornament text="Mods" />

  <p class="lede measure">
    BepInEx 5 plugins for <b>Lazy Witch&rsquo;s Factory</b>.
    First time? <a href={href('install')}>Set up BepInEx</a> before installing any of these.
  </p>

  <div class="grid">{mods.map((mod) => <ModCard mod={mod} />)}</div>

  <p class="lede measure">
    Want to make one? Start with <a href={href('guides/first-mod')}>Your first mod</a>.
  </p>
</Base>

<style>
  .lede { margin: 0 auto 2rem; text-align: center; }
  .lede:last-child { margin: 3rem auto 0; }
  .grid { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr)); }
</style>
```

- [ ] **Step 5: Finish the mod page**

`src/pages/mods/[slug].astro`:

```astro
---
import { getCollection, render } from 'astro:content';
import Base from '../../layouts/Base.astro';
import Ornament from '../../components/Ornament.astro';
import { downloadUrl, latestTag } from '../../lib/release';
import { href } from '../../lib/url';

export async function getStaticPaths() {
  const mods = await getCollection('mods');
  return mods.map((mod) => ({ params: { slug: mod.id }, props: { mod } }));
}

const { mod } = Astro.props;
const { Content } = await render(mod);
const tag = await latestTag(mod.data.repo, mod.data.version);
---
<Base title={`${mod.data.title} — Lazy Witch's Factory modding`} description={mod.data.summary}>
  <Ornament text={mod.data.title} />

  <div class="bar">
    <a class="btn" href={downloadUrl(mod.data.repo, mod.data.dll)} download>
      Download{tag ? ` ${tag}` : ''}
    </a>
    <a class="btn ghost" href={href('install')}>How to install</a>
    <a class="btn ghost" href={`https://github.com/${mod.data.repo}`}>Source</a>
    <span class="built">Built against {mod.data.gameVersion}</span>
  </div>

  <article class="prose"><Content /></article>
</Base>

<style>
  .bar { display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; justify-content: center; margin-bottom: 2.5rem; }
  .built { color: var(--muted); font-size: 0.85rem; }
</style>
```

- [ ] **Step 6: Run the tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: mods-first home page and mod detail pages"
```

---

### Task 9: Retire the old site

**Files:**
- Delete: `index.html`, `mods.html`, `guides.html`, `mod.html`, `guide.html`, `lib.js`, `style.css`, `guides.json`
- Create: `public/mods.html`, `public/guides.html`, `public/mod.html`, `public/guide.html`
- Modify: `README.md`
- Test: `tests/dist.test.mjs` (append)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Append to `tests/dist.test.mjs`:

```js
test('old URLs redirect rather than 404', () => {
  for (const [file, target] of [
    ['mods.html', '/lwf-modding/'],
    ['guides.html', '/lwf-modding/guides/'],
    ['mod.html', '/lwf-modding/'],
    ['guide.html', '/lwf-modding/guides/'],
  ]) {
    const doc = docs.find((d) => d.path === file);
    assert.ok(doc, `${file} shim was not built`);
    assert.ok(doc.html.includes(target), `${file} does not point at ${target}`);
  }
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test
```

Expected: FAIL — `mods.html` shim was not built.

- [ ] **Step 3: Delete the old site**

```bash
git rm index.html mods.html guides.html mod.html guide.html lib.js style.css guides.json
```

- [ ] **Step 4: Write the four shims**

Each is one file in `public/`. For `public/mods.html` (and the same shape for the other three, with the target swapped):

```html
<!doctype html>
<meta charset="utf-8">
<title>Moved</title>
<link rel="canonical" href="https://meowous3.github.io/lwf-modding/">
<meta http-equiv="refresh" content="0; url=/lwf-modding/">
<p><a href="/lwf-modding/">This page has moved.</a></p>
```

Targets: `mods.html` and `mod.html` → `/lwf-modding/`; `guides.html` and `guide.html` → `/lwf-modding/guides/`.

The old `mod.html?r=…` and `guide.html?g=…` links carried their target in the query string, which a static host cannot act on, so they land on the section index.

- [ ] **Step 5: Update `README.md`**

Fix the three guide paths, which the rename in Task 2 broke, and describe how to add things now:

```markdown
# Lazy Witch's Factory — modding

Notes from modding **Lazy Witch's Factory** with BepInEx 5. Unity 6000.0.80f1, Mono, x64.

**https://meowous3.github.io/lwf-modding/**

- [`pages/install.md`](pages/install.md) — installing mods. Start here if you just want to play.
- [`guides/first-mod.md`](guides/first-mod.md) — nothing to a working plugin, step by step.
- [`guides/reference.md`](guides/reference.md) — how the game is put together and where it gives way.
- [`guides/agents.md`](guides/agents.md) — the same ground as protocol, for coding agents.

## Mods

| | |
|---|---|
| [lwf-custom-difficulty](https://github.com/meowous3/lwf-custom-difficulty) | A difficulty whose time limit, repayments, growth curve and taxes you set in-game. |

## Adding to the site

A mod is a Markdown file in [`mods/`](mods); a guide is one in [`guides/`](guides). Both are
plain frontmatter plus prose — see an existing file. Download links resolve to each repo's
latest release automatically, so publishing a release is enough.

```bash
npm install
npm run dev     # local preview
npm test        # build, then verify the built output
```

## Licence

MIT.
```

- [ ] **Step 6: Run the tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: retire the runtime-fetch site, leaving redirects"
```

---

### Task 10: Deploy

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `npm test` from every previous task.
- Produces: nothing.

- [ ] **Step 1: Write the workflow**

The build runs the full test suite first, so a broken link or a runtime API call fails the deploy rather than shipping.

```yaml
name: Deploy

on:
  push:
    branches: [master]
  schedule:
    - cron: '0 4 * * 1'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Verify the workflow parses**

```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy.yml')); print('valid')"
```

Expected: `valid`.

- [ ] **Step 3: Commit**

```bash
git add .github
git commit -m "ci: build and deploy to Pages from Actions"
```

- [ ] **Step 4: Hand off the manual step**

The repository owner must set **Settings → Pages → Source: GitHub Actions**. Until then the
workflow builds and uploads but the live site keeps serving the old branch content. Report this
as the remaining action; do not attempt it from the CLI.

---

## Final verification

Run before declaring the work done:

```bash
rm -rf dist .astro
npm ci
npm test
grep -rc 'api\.github\.com' dist/ || echo 'no runtime API calls — correct'
```

Then screenshot each route at both widths and confirm nothing overflows horizontally:

```bash
npx serve dist -l 4321 &
for p in "" install/ guides/ guides/first-mod/ guides/reference/ guides/agents/ mods/custom-difficulty/; do
  for w in 1200 400; do
    chromium-browser --headless --disable-gpu --no-sandbox --virtual-time-budget=6000 \
      --window-size=$w,2000 --screenshot="/tmp/shot-$(echo "$p" | tr '/' '_')-$w.png" \
      "http://localhost:4321/lwf-modding/$p"
  done
done
```
