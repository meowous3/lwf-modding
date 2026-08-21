import GithubSlugger from 'github-slugger';

// Guide Markdown is authored to read correctly on github.com, where a sibling guide is
// `reference.md`. On the site the same guide lives at /guides/reference/, so the hrefs are
// rewritten at build time rather than the prose being written for one reader and broken
// for the other.
const PAGE_MD = /^\.\.\/pages\/([A-Za-z0-9._-]+)\.md(#.*)?$/;
const SIBLING_MD = /^([A-Za-z0-9._-]+)\.md(#.*)?$/;

export function guideLinks(base) {
  return {
    name: 'guide-links',
    element: {
      filter: ['a'],
      visit(node) {
        const href = node.properties?.href;
        if (typeof href !== 'string') return;
        // The install page is not a guide: it lives in pages/ and routes to /install/.
        // From a guide's directory the github.com-correct path is ../pages/install.md.
        const page = PAGE_MD.exec(href);
        if (page) {
          const [, slug, fragment = ''] = page;
          return {
            ...node,
            properties: { ...node.properties, href: `${base}/${slug}/${fragment}` },
          };
        }
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

// Markdown authored to read on github.com points at a root-relative `/media/...`, which is
// where the file sits in `public/`. On Pages the site is served from a base path, so the same
// src has to be prefixed or it resolves to the domain root and 404s. Same reasoning as
// `guideLinks`: write it once for both readers and fix it at build time.
export function mediaPaths(base) {
  return {
    name: 'media-paths',
    element: {
      filter: ['img'],
      visit(node) {
        const src = node.properties?.src;
        // Protocol-relative (`//host/…`) is absolute, and an src already under the base is
        // left alone so the plugin is safe to run twice.
        if (typeof src !== 'string') return;
        if (!src.startsWith('/') || src.startsWith('//') || src.startsWith(`${base}/`)) return;
        return {
          ...node,
          properties: { ...node.properties, src: `${base}${src}`, loading: 'lazy' },
        };
      },
    },
  };
}

// @astrojs/markdown-satteri runs every user hastPlugin BEFORE its own built-in
// heading-id plugin (see createSatteriMarkdownProcessor: userHastPlugins are
// pushed ahead of createHeadingIdsPlugin()), so `node.properties.id` is not yet
// set when this plugin's visit runs — Astro has not assigned ids yet, despite
// emitting them "natively". This plugin therefore computes the id itself when
// missing; the built-in plugin that runs afterwards sees a string id already
// present and leaves it alone, so there is still exactly one id per heading.
//
// The id is generated with `github-slugger` — the exact package Astro's own
// heading-id plugin uses — rather than a hand-rolled regex, so the id this
// plugin assigns can never diverge from what Astro would have assigned itself
// (e.g. a hand-rolled `[^a-z0-9]+` regex turns an apostrophe into a hyphen;
// github-slugger drops it with no separator: "Witch's" -> "witchs", not
// "witch-s").
//
// `slugger` is rebuilt in `before`, which satteri runs once per document
// ahead of this plugin's visitors (see node_modules/satteri/dist/hast/hast-
// visitor.d.ts). The plugin object itself is created once, at astro.config.mjs
// load time, and reused across every file in the build — without this reset,
// GithubSlugger's own de-duplication ("Architecture" -> "architecture" the
// first time it's seen, "architecture-1" the next) would carry over between
// unrelated guides, so a heading unique within its own document could end up
// with a suffixed id there instead of the plain one.
export function headingAnchors() {
  let slugger = new GithubSlugger();
  return {
    name: 'heading-anchors',
    before() {
      slugger = new GithubSlugger();
    },
    element: {
      filter: ['h2', 'h3'],
      visit(node, ctx) {
        let id = node.properties?.id;
        if (typeof id !== 'string' || !id) {
          id = slugger.slug(ctx.textContent(node));
        }
        return {
          ...node,
          properties: { ...node.properties, id },
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

/* --- Platform tabs -------------------------------------------------------
 *
 * A tab group is authored as a container directive holding one bold-only
 * paragraph per pane:
 *
 *     :::tabs
 *
 *     **Windows**
 *
 *     ```powershell
 *     Select-String "Chainloader started" "<game>\BepInEx\LogOutput.log"
 *     ```
 *
 *     **Linux / macOS**
 *
 *     ```bash
 *     grep "Chainloader started" "<game>/BepInEx/LogOutput.log"
 *     ```
 *
 *     :::
 *
 * The marker is a plain `**bold**` paragraph rather than a nested directive
 * because these files are read on github.com, which knows nothing about
 * `:::`. There it degrades to a bold heading over each code block — the two
 * bare `:::` lines are the only sigils a GitHub reader sees, and no content
 * is lost or reordered.
 *
 * Two plugins, one feature: directives are an MDAST concept and are dropped
 * before HAST unless a plugin claims them, so `tabsDirective` (MDAST) keeps
 * the node alive as a placeholder element and `tabGroups` (HAST) turns it
 * into the real control — by which point Astro's highlighter has already
 * turned the fences inside it into <pre> trees, so a pane keeps its
 * highlighting for free.
 */

const TABS_TAG = 'lwf-tabs';

// Tab keys are the values the stylesheet switches on. Each key needs a rule
// pair in the "Tabs" section of src/styles/prose.css; a key with no pair
// would render every pane of its group at once, so an unknown one is a build
// error rather than a silent mis-render.
export const TAB_KEYS = ['windows', 'linux-macos'];

const tabKey = (label) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function tabsDirective() {
  return {
    name: 'tabs-directive',
    containerDirective(node, ctx) {
      if (node.name !== 'tabs') {
        // Every other name is unclaimed. Rendering it as a plain div keeps the
        // prose inside it on the page instead of dropping it silently.
        ctx.report({
          message: `Unknown container directive :::${node.name}. Only :::tabs is handled.`,
          node,
          severity: 'warning',
        });
        ctx.setProperty(node, 'data', { hName: 'div' });
        return;
      }
      ctx.setProperty(node, 'data', {
        hName: TABS_TAG,
        hProperties: { group: node.attributes?.group || 'platform' },
      });
    },
  };
}

// A pane marker: a paragraph that is nothing but one bold run.
function markerLabel(node, ctx) {
  if (node.type !== 'element' || node.tagName !== 'p') return null;
  const children = node.children ?? [];
  if (children.length !== 1) return null;
  const [only] = children;
  if (only.type !== 'element' || only.tagName !== 'strong') return null;
  return ctx.textContent(only).trim() || null;
}

const isBlank = (node) => node.type === 'text' && !node.value.trim();

export function tabGroups() {
  let count = 0;
  return {
    name: 'tab-groups',
    before() {
      count = 0;
    },
    element: {
      filter: [TABS_TAG],
      visit(node, ctx) {
        const group =
          typeof node.properties?.group === 'string' ? node.properties.group : 'platform';
        const panes = [];
        let stray = false;
        for (const child of node.children ?? []) {
          const label = markerLabel(child, ctx);
          if (label) {
            panes.push({ label, key: tabKey(label), children: [] });
          } else if (panes.length === 0) {
            if (!isBlank(child)) stray = true;
          } else {
            panes[panes.length - 1].children.push(child);
          }
        }
        if (stray) {
          ctx.report({
            message: ':::tabs has content before its first **label** marker.',
            node,
            severity: 'error',
          });
        }
        if (panes.length < 2) {
          ctx.report({
            message: ':::tabs needs at least two **label** markers.',
            node,
            severity: 'error',
          });
          // Unwrap rather than render a one-tab control: the content survives.
          return { type: 'element', tagName: 'div', properties: {}, children: node.children ?? [] };
        }
        for (const pane of panes) {
          if (!TAB_KEYS.includes(pane.key)) {
            ctx.report({
              message: `Tab "${pane.label}" has no rule pair in prose.css. Add one for "${pane.key}" or use one of: ${TAB_KEYS.join(', ')}.`,
              node,
              severity: 'error',
            });
          }
        }

        const index = ++count;
        // One radio group per dimension for the whole document, so every tab
        // group on the page moves together: the reader picks a platform once.
        const name = `lwf-tab-${group}`;
        const bar = {
          type: 'element',
          tagName: 'div',
          properties: { class: 'tabs-bar', role: 'group', 'aria-label': 'Platform' },
          children: panes.flatMap((pane, i) => {
            const id = `tab-${index}-${pane.key}`;
            const input = {
              type: 'element',
              tagName: 'input',
              properties: {
                type: 'radio',
                class: 'tabs-radio',
                name,
                id,
                value: pane.key,
                // Every group marks its first tab checked. They share a name,
                // so the browser keeps the last one — still the first tab, so
                // the page opens on it whichever group wins.
                ...(i === 0 ? { checked: true } : {}),
                // Radios normally share one tab stop. Here the group spans the
                // whole document, so without this only one bar on the page
                // would be reachable by keyboard.
                tabindex: '0',
              },
              children: [],
            };
            const label = {
              type: 'element',
              tagName: 'label',
              properties: { class: 'tabs-tab', for: id, 'data-tab': pane.key },
              children: [{ type: 'text', value: pane.label }],
            };
            return [input, label];
          }),
        };
        const sections = panes.map((pane) => ({
          type: 'element',
          tagName: 'section',
          properties: { class: 'tabs-pane', 'data-tab': pane.key },
          children: [
            // Named again inside the pane, hidden by CSS. If the stylesheet
            // never arrives every pane is visible, and this is what tells them
            // apart.
            {
              type: 'element',
              tagName: 'p',
              properties: { class: 'tabs-pane-name' },
              children: [{ type: 'text', value: pane.label }],
            },
            ...pane.children,
          ],
        }));
        return {
          type: 'element',
          tagName: 'div',
          properties: { class: 'tabs' },
          children: [bar, ...sections],
        };
      },
    },
  };
}
