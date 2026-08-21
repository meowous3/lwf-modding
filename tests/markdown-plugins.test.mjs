import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slug as ghSlug } from 'github-slugger';
import { guideLinks, headingAnchors } from '../src/lib/markdown-plugins.mjs';

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

// The `headingAnchors()` factory is called once, at astro.config.mjs load
// time, and the plugin object it returns is reused by satteri across every
// file in the build. Its de-duplication state must therefore be scoped to
// the document currently being compiled — via the `before` hook, which
// satteri runs once per document ahead of this plugin's visitors — not to
// the whole build. Without that reset, a heading that is unique within its
// own document (e.g. one "## Architecture" per guide, across several guides)
// would come out suffixed ("architecture-1") in every guide after the first
// that happens to share heading text, purely because of build order.
const heading = (text) => ({
  type: 'element',
  tagName: 'h2',
  properties: {},
  children: [{ type: 'text', value: text }],
});
const headingCtx = { textContent: (node) => node.children.map((c) => c.value).join('') };

test('the same heading text in two different documents gets the same id in each', () => {
  const plugin = headingAnchors();

  plugin.before();
  const firstDoc = plugin.element.visit(heading('Architecture'), headingCtx);

  plugin.before();
  const secondDoc = plugin.element.visit(heading('Architecture'), headingCtx);

  assert.equal(firstDoc.properties.id, 'architecture');
  assert.equal(secondDoc.properties.id, 'architecture');
});

test('a repeated heading within the same document is still de-duplicated', () => {
  const plugin = headingAnchors();

  plugin.before();
  const first = plugin.element.visit(heading('Architecture'), headingCtx);
  const second = plugin.element.visit(heading('Architecture'), headingCtx);

  assert.equal(first.properties.id, 'architecture');
  assert.equal(second.properties.id, 'architecture-1');
});

test('generated ids match github-slugger byte-for-byte, including punctuation Astro strips differently than a naive regex would', () => {
  const plugin = headingAnchors();
  plugin.before();
  const text = "Agent guide: modding Lazy Witch's Factory";
  const node = plugin.element.visit(heading(text), headingCtx);
  assert.equal(node.properties.id, ghSlug(text));
  assert.equal(node.properties.id, 'agent-guide-modding-lazy-witchs-factory');
});
