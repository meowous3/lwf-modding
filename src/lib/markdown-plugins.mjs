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

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// @astrojs/markdown-satteri runs every user hastPlugin BEFORE its own built-in
// heading-id plugin (see createSatteriMarkdownProcessor: userHastPlugins are
// pushed ahead of createHeadingIdsPlugin()), so `node.properties.id` is not yet
// set when this plugin's visit runs — Astro has not assigned ids yet, despite
// emitting them "natively". This plugin therefore computes the id itself when
// missing; the built-in plugin that runs afterwards sees a string id already
// present and leaves it alone, so there is still exactly one id per heading.
export function headingAnchors() {
  const seen = new Map();
  return {
    name: 'heading-anchors',
    element: {
      filter: ['h2', 'h3'],
      visit(node, ctx) {
        let id = node.properties?.id;
        if (typeof id !== 'string' || !id) {
          const base = slugify(ctx.textContent(node)) || 'section';
          const count = seen.get(base) ?? 0;
          seen.set(base, count + 1);
          id = count === 0 ? base : `${base}-${count}`;
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
