import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slug as ghSlug } from 'github-slugger';
import { guideLinks, headingAnchors, mediaPaths, tabGroups } from '../src/lib/markdown-plugins.mjs';

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

const img = (src) => ({ type: 'element', tagName: 'img', properties: { src }, children: [] });
const media = mediaPaths('/lwf-modding').element.visit;

test('prefixes a root-relative image src with the base', () => {
  assert.equal(media(img('/media/shot.png')).properties.src, '/lwf-modding/media/shot.png');
});

test('leaves an absolute image src alone', () => {
  assert.equal(media(img('https://example.com/shot.png')), undefined);
  assert.equal(media(img('//example.com/shot.png')), undefined);
});

test('leaves a relative image src alone', () => {
  assert.equal(media(img('shot.png')), undefined);
});

test('is safe to run twice', () => {
  assert.equal(media(img('/lwf-modding/media/shot.png')), undefined);
});

// --- Platform tabs ---------------------------------------------------------
//
// A `:::tabs` group is split on its bold-only paragraphs: each one starts a
// pane and names its tab. Everything else in the group belongs to the pane
// above it.
const el = (tagName, properties, children = []) => ({ type: 'element', tagName, properties, children });
const marker = (label) => el('p', {}, [el('strong', {}, [{ type: 'text', value: label }])]);
const group = (...children) => el('lwf-tabs', { group: 'platform' }, children);
const textContent = (node) =>
  node.type === 'text' ? node.value : (node.children ?? []).map(textContent).join('');
const tabsCtx = () => {
  const reports = [];
  return { reports, ctx: { textContent, report: (r) => reports.push(r) } };
};
const run = (node) => {
  const plugin = tabGroups();
  const { ctx, reports } = tabsCtx();
  plugin.before();
  return { out: plugin.element.visit(node, ctx), reports };
};

test('a tab group becomes one pane per bold marker, keeping the content under it', () => {
  const { out, reports } = run(
    group(marker('Windows'), el('pre', { 'data-language': 'powershell' }),
          marker('Linux / macOS'), el('pre', { 'data-language': 'bash' })),
  );
  assert.deepEqual(reports, []);
  const panes = out.children.filter((c) => c.properties.class === 'tabs-pane');
  assert.deepEqual(
    panes.map((p) => p.properties['data-tab']),
    ['windows', 'linux-macos'],
    'the tab key is the slug of the label above the pane',
  );
  // The pane keeps the highlighted <pre> it was authored with, and names
  // itself for the reader whose stylesheet never arrives.
  assert.deepEqual(
    panes.map((p) => p.children.map((c) => c.tagName)),
    [['p', 'pre'], ['p', 'pre']],
  );
  assert.equal(panes[0].children[1].properties['data-language'], 'powershell');
  assert.equal(panes[1].children[1].properties['data-language'], 'bash');
});

test('every tab group on a page drives one radio group, so selection syncs', () => {
  const plugin = tabGroups();
  const { ctx } = tabsCtx();
  plugin.before();
  const one = plugin.element.visit(group(marker('Windows'), el('pre', {}), marker('Linux / macOS'), el('pre', {})), ctx);
  const two = plugin.element.visit(group(marker('Windows'), el('pre', {}), marker('Linux / macOS'), el('pre', {})), ctx);
  const radios = (out) => out.children[0].children.filter((c) => c.tagName === 'input');
  const names = new Set([...radios(one), ...radios(two)].map((r) => r.properties.name));
  assert.equal(names.size, 1, 'two groups on a page must share one radio name');
  // Ids may not: they are what each label points at.
  const ids = [...radios(one), ...radios(two)].map((r) => r.properties.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate radio ids on one page');
});

test('a group with fewer than two markers is reported and left as prose', () => {
  const { out, reports } = run(group(marker('Windows'), el('pre', {})));
  assert.equal(reports.length, 1);
  assert.equal(reports[0].severity, 'error');
  // The content survives: an author mistake must not silently delete a command.
  assert.equal(out.tagName, 'div');
  assert.equal(out.children.length, 2);
});

test('a tab key with no rule pair in the stylesheet is a build error', () => {
  const { reports } = run(group(marker('Windows'), el('pre', {}), marker('Haiku'), el('pre', {})));
  assert.equal(reports.length, 1);
  assert.match(reports[0].message, /haiku/);
});
