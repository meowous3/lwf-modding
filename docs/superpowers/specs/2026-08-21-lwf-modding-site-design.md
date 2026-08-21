# Rebuilding the Lazy Witch's Factory modding site

## Why

The site renders nothing on its own. Every page ships an empty skeleton and fills it from
`api.github.com` at load time. That one decision causes most of what is wrong with it, and
several problems that look cosmetic are downstream of it.

Measured against the live site on 2026-08-21:

1. **Rate limit.** Unauthenticated GitHub allows 60 requests an hour per address. The index
   costs about four, a guide two, a mod page three. A visitor who browses for a few minutes
   starts seeing "Could not load the mod list."
2. **Nothing is indexable.** A crawler sees `Loading…`. With JavaScript off there is no site.
3. **Guides are fetched through an API to read files that are already deployed.**
   `guides/MODDING.md` sits in the published directory; `lib.js` reads it from
   `api.github.com/repos/meowous3/lwf-modding/contents/guides/MODDING.md`.
4. **Cross-guide links 404.** `GETTING-STARTED.md` links to `MODDING.md`. Rendered at
   `/guide.html?g=getting-started`, that resolves to `/MODDING.md`.
5. **In-page anchors are dead.** GitHub emits heading ids as `user-content-<slug>` and links
   as `#<slug>`; on github.com a script reconciles them, here nothing does. Nothing inside a
   guide can be linked to.
6. **No wayfinding.** `GETTING-STARTED.md` is 213 lines and ten steps in one scroll, with no
   table of contents and no next/previous.
7. **Every guide and mod page prints its title twice** — once from the manifest, once from the
   markdown's own H1.
8. **Syntax highlighting is fetched and discarded.** GitHub returns `pl-k`/`pl-s`/`pl-c` spans;
   `style.css` defines none of them, so every C# and XML block is flat cream text, and wide
   blocks overflow inside an 860px column.
9. **The mod card renders an empty description** because `meowous3/lwf-custom-difficulty` has
   `"description": null` and the site has no fallback.
10. **Structural duplication.** Header, nav and footer are copy-pasted into five HTML files;
    the guides-grid renderer is duplicated verbatim in `index.html` and `guides.html`.

### The content problem underneath

The site is built for one audience and used by two. Most visitors want to **install a mod**;
a minority want to **write one**. Install instructions currently exist in two places, neither
of which a player would open:

- `guides/GETTING-STARTED.md` §1–3, inside a page titled "Your first mod".
- Each mod's own README, restated and shorter.

The consequence is specific and costly. The Proton launch option —

```
WINEDLLOVERRIDES="winhttp=n,b" %command%
```

— is documented **only** in the developer guide, which calls it "the single most common reason
a first plugin appears to do nothing." The mod README does not mention it. A Linux player
installs a mod, sees no error, and nothing happens.

## What we are building

A static site, built with Astro, deployed to GitHub Pages by an Action. Mods first, one
canonical install page, guides as a distinct section for people writing mods.

Pinned versions: **Astro 7.2.4**, which requires **Node >= 22.12.0** (`engines` field). Content
collections use the `glob()` loader from `astro/loaders` and a zod 4 schema in
`src/content.config.ts` — both verified present in 7.2.4.

### Non-goals

- No search. Three guides and one mod do not need it.
- No client-side framework, no islands. The site ships zero JavaScript except the sidebar's
  scroll-spy, which degrades to nothing if it fails.
- No CMS, no comments, no analytics.
- No redesign of the guides' prose beyond the install split described below.

## Information architecture

```
/                      mods, an install pointer, a guides pointer
/install/              the canonical player install path
/mods/<slug>/          one page per mod
/guides/               short index
/guides/first-mod/     sidebar + TOC + prev/next
/guides/reference/
/guides/agents/
```

Navigation is **Mods · Install · Guides · GitHub**.

The sidebar appears on `/guides/*` only. It lists every guide, and nests the current guide's
`h2` headings beneath it. Mod pages and `/install/` use a single-column layout.

Below the sidebar's breakpoint the sidebar collapses and `Toc.astro` renders the same headings
inline at the top of the guide. The two never appear at once; they are the wide and narrow
presentations of one list.

### Old URLs

`mods.html`, `guides.html`, `mod.html` and `guide.html` remain in `public/` as meta-refresh
shims pointing at `/mods/`, `/guides/`, `/mods/` and `/guides/`. Query-string URLs
(`guide.html?g=notes`) cannot be redirected statically, so they land on the section index
rather than the specific page.

## Content model

Markdown stays at the repository root so the repo remains readable on github.com. Astro's
`glob()` loader reads it from there rather than from `src/content/`.

```
guides/
  first-mod.md      (was GETTING-STARTED.md)
  reference.md      (was MODDING.md)
  agents.md         (was AGENTS.md)
mods/
  custom-difficulty.md
```

Files are renamed with `git mv` so the slug matches the route. `README.md` links are updated
in the same commit; it is the only known linker.

### Guide frontmatter

```yaml
title: Your first mod
blurb: From nothing to a plugin you can see working.
order: 1
```

Validated by a zod schema in `src/content.config.ts`. `guides.json` is deleted — the manifest
is the frontmatter, and cannot drift from the files it describes.

### Mod frontmatter

```yaml
title: Custom Difficulty
repo: meowous3/lwf-custom-difficulty
dll: LwfCustomDifficulty.dll
summary: Set the time limit, repayments, growth curve and taxes yourself.
gameVersion: "0.21.0"
version: v0.2.0        # fallback only; see Releases
```

`summary` replaces the GitHub `description` field the site currently depends on, which is
`null`. `mods.json` is deleted.

The body is authored here rather than fetched from the mod's README.

> **Accepted tradeoff.** The mod's README and its page here can drift. The alternative —
> fetching the README at build time — reintroduces a cross-repo dependency, where the site
> stays stale until something re-triggers the Action. The two documents also serve different
> readers: the README serves someone already on GitHub, the page serves someone deciding
> whether to install. If drift becomes a real problem, switching to a build-time fetch is a
> change to one module.

### The install split

| Content | Destination |
|---|---|
| BepInEx 5.4.23.5 `win_x64` into the game folder | `/install/` |
| Take the Windows build even on Linux | `/install/` |
| The Proton launch option | `/install/` |
| Run the game once; BepInEx generates its folders | `/install/` |
| `grep "Chainloader started"` verification | `/install/` |
| Where the `.dll` goes | `/install/` |
| Uninstalling | `/install/` (new) |
| "Nothing happened" troubleshooting | `/install/` (new) |
| .NET SDK 8+ | `/guides/first-mod/` |
| The `BepInEx.cfg` `WriteUnityLog`/`AppendLog` tweak | `/guides/first-mod/` |
| Project, plugin, build, iterate, find targets | `/guides/first-mod/` |

`first-mod.md` opens by pointing at `/install/` for BepInEx rather than restating §1–3. Its
step numbering is renumbered to start from the project setup.

`/install/` is authored as `src/pages/install.astro` wrapping a markdown partial, so it can
carry the numbered-step layout without inventing frontmatter for a one-off page.

## Releases and downloads

The download button links to:

```
https://github.com/<repo>/releases/latest/download/<dll>
```

Verified 2026-08-21: this returns 302 to the current asset. **No API call, ever.** A player's
primary action cannot be broken by a rate limit.

The version *label* is resolved at build time by `src/lib/release.ts`:

- Reads `GITHUB_TOKEN` from the environment when present (the Action supplies one).
- Fetches `/repos/<repo>/releases/latest`; memoizes per build.
- Returns `{ tag }`, or `null` on any failure.

Pages render `release?.tag ?? entry.data.version ?? null`, and omit the label entirely when
both are absent. A stale or missing label can never produce a stale download.

## Visual direction

Taken from the game's own UI, which is **dark panels on a warm light ground** — the inverse of
the current site.

```css
--ground:        #cfc6b8;   /* parchment; radial vignette toward --ground-edge */
--ground-edge:   #b8ae9e;
--surface:       #2b2320;   /* panels, cards, code blocks */
--surface-edge:  #161110;   /* the stacked-plaque layer behind a card */
--surface-lip:   #3d332c;   /* inner highlight */
--ink:           #3a2c22;   /* text on parchment */
--ink-inverse:   #e8dcc4;   /* text on surface */
--muted:         #8a7a6a;
--ember:         #9c4430;   /* primary action outline */
--ember-fill:    #3a1c17;
--gold:          #d1b085;   /* links, secondary accents */
```

- **Type.** Fraunces (700/900) for headings; Nunito Sans (400/600/800) for body and UI labels,
  800 for buttons. Both declared in Astro 7's stable top-level `fonts` config with
  `fontProviders.google()`, which **self-hosts** them — the built site makes no request to
  Google, and Astro generates size-adjusted fallback metrics automatically. Verified: files
  emit to `dist/_astro/fonts/*.woff2` with the base path applied to the preload tags.
- **Ornament.** `◈` flanking page titles, and the game's double rule — a long line with a
  shorter offset line beneath — as the section divider.
- **Cards** carry the game's stacked edge: a solid offset layer behind, not a blur.
- **Code blocks** are `--surface` on parchment, highlighted by Shiki with a warm theme.
- **Links** get one global rule rather than seven per-selector ones. The current stylesheet
  colours links in `.md`, `nav`, `.crumb`, `.card h3`, `.brand`, `.more` and `.btn`
  individually; anything outside those falls through to browser blue.
- **Dark mode** (`prefers-color-scheme`) deepens the ground to `#17120e` and keeps the accents.
- Long-form measure is capped at 72ch. Code blocks are allowed to exceed it and scroll within
  their own container; the page body never scrolls horizontally.

## Repository shape

```
.github/workflows/deploy.yml
astro.config.mjs                 site + base: '/lwf-modding'
package.json
public/
  favicon.svg
  mods.html  guides.html  mod.html  guide.html    meta-refresh shims
guides/        first-mod.md  reference.md  agents.md
mods/          custom-difficulty.md
src/
  content.config.ts
  lib/
    release.ts
    url.ts                       base-path-aware href helper
  components/
    Ornament.astro  ModCard.astro  Sidebar.astro  Toc.astro  PrevNext.astro
  layouts/
    Base.astro  Doc.astro  Mod.astro
  pages/
    index.astro  install.astro
    guides/index.astro  guides/[slug].astro
    mods/[slug].astro
  styles/
    tokens.css  prose.css
```

Deleted: `lib.js`, `style.css`, `guides.json`, `mods.json`, and the five hand-written HTML
pages (four survive as shims in `public/`).

### Base path

The site is a GitHub Pages *project* page, served under `/lwf-modding/`. Every internal link
goes through `src/lib/url.ts` rather than a literal string, so a link cannot silently work in
`astro dev` and 404 in production.

### Markdown pipeline

Astro 7 replaced remark/rehype with **Sätteri** as its default Markdown processor. Everything
below was verified against Astro 7.2.4 with a working build on 2026-08-21, not assumed.

- **Heading ids are native.** Sätteri emits `<h2 id="step-one">` with no plugin, and the slugs
  match what `render()` returns in `headings`. `rehype-slug` is not needed.
- **Syntax highlighting is native**, via `markdown.shikiConfig`. Configured as
  `themes: { light, dark }` with `defaultColor: false`, which emits both palettes as
  `--shiki-light` / `--shiki-dark` CSS variables on every token. Code blocks therefore follow
  the site's light/dark mode with no JavaScript and no second stylesheet.
- **`remarkPlugins` and `rehypePlugins` are the legacy path** in Astro 7 — using them requires
  installing `@astrojs/markdown-remark` and emits a deprecation warning. We do not use them.
  Instead `markdown.processor` is set to `satteri({ hastPlugins: [...] })`, the supported
  extension point.
- Two local hast plugins, each a small object of the form
  `{ name, element: { filter: ['a'], visit(node, ctx) {...} } }`:
  - `guide-links` rewrites `<name>.md` and `<name>.md#anchor` hrefs to `/guides/<name>/`. This
    keeps the markdown correct when read raw on github.com *and* correct on the site, fixing
    defect 4 without hardcoding routes into prose. Verified: `[the reference](reference.md)`
    builds to `<a href="/lwf-modding/guides/reference/">`.
  - `heading-anchors` appends a `#` affordance to each `h2`/`h3`, visible on hover.
- `render()` supplies `headings` for the TOC and sidebar.

## Testing

Automated, run in CI:

1. `npm run build` exits 0.
2. Internal link check over `dist/` — every internal `href` resolves to a file that exists.
3. `grep -r 'api\.github\.com' dist/` returns nothing. This is the defect that started the
   rebuild; it is checkable, so it gets checked.
4. `grep -r 'releases/latest/download/' dist/` returns one hit per mod.
5. Every guide route contains exactly one `<h1>`. Guards against the duplicated-title defect.

Manual, once:

- Headless screenshots of `/`, `/install/`, `/mods/custom-difficulty/` and each guide at
  1200px and 400px width.
- The Proton launch option is present on `/install/`.

## Deployment

`.github/workflows/deploy.yml` — on push to `master`, plus a weekly `schedule` so version
labels refresh after a mod release without a manual push. Uses `actions/configure-pages`,
`withastro/action@v3`, `actions/deploy-pages`, with `GITHUB_TOKEN` exposed to the build for the
release lookup.

**One manual step, and it is yours to take.** Pages currently serves the `master` branch root.
It has to be switched to *Source: GitHub Actions* in the repository's Settings → Pages. Until
that switch, the Action will build and upload but the live site will keep serving the old
files. Nothing in this plan can make that change on your behalf.

## Settled

- **Guide title.** "Modding reference", sidebar label "Reference". The audience tag
  ("Reference") is dropped as redundant with the title.
- **Mod page authorship.** Authored in this repo, not fetched from the mod's README. The drift
  risk is accepted; see the tradeoff note under Content model.
