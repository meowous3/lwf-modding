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
