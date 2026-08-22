import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const DIST = new URL('../dist/', import.meta.url);
const BASE = '/lwf-modding';

// The body of guides/agents.md as the glob loader hands it to the site: frontmatter
// stripped, leading/trailing whitespace trimmed — exactly what the raw endpoint and the
// raw <pre> are both built from.
const source = await readFile(new URL('../guides/agents.md', import.meta.url), 'utf8');
const body = source.replace(/^---\n[\s\S]*?\n---\n/, '').trim();

test('the raw .md endpoint is present in the built output', async () => {
  await assert.doesNotReject(readFile(new URL('guides/agents.md', DIST), 'utf8'));
});

test('the raw .md endpoint content matches the source file', async () => {
  const served = await readFile(new URL('guides/agents.md', DIST), 'utf8');
  assert.equal(served, body);
});

test('the agents guide page offers a download link to the raw endpoint', async () => {
  const html = await readFile(new URL('guides/agents/index.html', DIST), 'utf8');
  assert.match(
    html,
    new RegExp(`<a class="[^"]*"\\s+href="${BASE}/guides/agents\\.md"[^>]*download[^>]*>`),
    'no download link to the raw endpoint',
  );
});

test('the agents guide page shows the raw Markdown source, not rendered prose', async () => {
  const html = await readFile(new URL('guides/agents/index.html', DIST), 'utf8');
  // Rendered guides turn "## Target" into a heading; the raw page must keep the literal
  // Markdown, unrendered, inside a <pre>.
  assert.match(html, /<pre class="raw"[^>]*><code[^>]*>[\s\S]*## Target/, 'agents body is not in a raw <pre>');
  assert.ok(!/<h2[^>]*>\s*Target/.test(html), 'the agents guide rendered a heading — it should not');
});

test('the other two guides still render as normal prose', async () => {
  for (const slug of ['first-mod', 'reference']) {
    const html = await readFile(new URL(`guides/${slug}/index.html`, DIST), 'utf8');
    assert.ok(!/class="raw[" ]/.test(html), `${slug}: unexpectedly has a raw <pre> block`);
    assert.match(html, /<h2 id="[^"]+"/, `${slug}: no rendered heading — it should read as prose`);
    assert.ok(!/##\s/.test(html.replace(/<[^>]+>/g, '')), `${slug}: a literal "##" leaked into the text`);
  }
});
