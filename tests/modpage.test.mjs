import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';

const DIST = new URL('../dist/', import.meta.url);
const MODS = new URL('../mods/', import.meta.url);
const BASE = '/lwf-modding';

const slugs = (await readdir(MODS)).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));

const pages = Object.fromEntries(
  await Promise.all(
    slugs.map(async (slug) => [
      slug,
      await readFile(new URL(`mods/${slug}/index.html`, DIST), 'utf8'),
    ]),
  ),
);

// Astro appends a scoped-style class to every class attribute, so `class="side"` never matches
// literally in the built markup — match the token inside the attribute instead.
const hasClass = (html, name) => new RegExp(`class="[^"]*\\b${name}\\b`).test(html);

/** The sidebar's <dl>, as [label, value-text] pairs with the markup stripped out. */
function metaRows(html) {
  const dl = /<dl class="meta[^"]*"[^>]*>([\s\S]*?)<\/dl>/.exec(html);
  assert.ok(dl, 'the sidebar has no metadata list');
  const text = (s) => s.replace(/<[^>]+>/g, '').trim();
  const rows = [];
  for (const m of dl[1].matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)) {
    rows.push([text(m[1]), text(m[2]), m[2]]);
  }
  return rows;
}

test('both mods exist and every one is built', () => {
  assert.ok(slugs.length >= 2, 'expected at least two mods');
  assert.ok(slugs.includes('custom-difficulty') && slugs.includes('camera-zoom'));
});

for (const slug of slugs) {
  test(`${slug}: the sidebar renders with the download plaque and the install link`, () => {
    const html = pages[slug];
    assert.ok(hasClass(html, 'side'), 'no sidebar');
    assert.ok(hasClass(html, 'grab'), 'no download control in the sidebar');
    assert.match(
      html,
      new RegExp(`<a class="how[^"]*" href="${BASE}/install/"`),
      'the How to install link is missing, or skips the base',
    );
  });

  test(`${slug}: the download link is the permanent redirect, not an API call`, async () => {
    const front = await readFile(new URL(`${slug}.md`, MODS), 'utf8');
    const repo = /^repo:\s*(.+)$/m.exec(front)[1].trim();
    const dll = /^dll:\s*(.+)$/m.exec(front)[1].trim();
    const grab = /<a class="grab[^"]*"[^>]*href="([^"]+)"|<a class="btn grab[^"]*"[^>]*href="([^"]+)"/
      .exec(pages[slug]);
    const url = grab && (grab[1] ?? grab[2]);
    assert.equal(url, `https://github.com/${repo}/releases/latest/download/${dll}`);
    assert.ok(!pages[slug].includes('api.github.com'), 'an API URL reached the page');
  });

  test(`${slug}: the sidebar table is the four agreed rows and nothing else`, () => {
    const labels = metaRows(pages[slug]).map(([label]) => label);
    const allowed = ['Released', 'Updated', 'Game version', 'Source'];
    assert.deepEqual(
      labels.filter((l) => !allowed.includes(l)),
      [],
      'a row the sidebar is not supposed to carry',
    );
    // The rows that never depend on the network are always there.
    assert.ok(labels.includes('Game version'), 'Game version is missing');
    assert.ok(labels.includes('Source'), 'Source is missing');
    // Explicitly not carried, per the design: these say nothing a reader needs.
    for (const banned of ['Requires BepInEx', 'Downloads', 'Size', 'Likes', 'Version']) {
      assert.ok(!labels.includes(banned), `the sidebar carries a ${banned} row`);
    }
  });

  test(`${slug}: a date row is absent rather than blank when GitHub gives nothing`, () => {
    const rows = metaRows(pages[slug]);
    // Whatever the build managed to fetch, no row may render empty, a dash or a placeholder:
    // the failure mode is a missing row, so a present row always carries a real value.
    for (const [label, value] of rows) {
      assert.ok(value.length > 0, `the ${label} row rendered blank`);
      assert.ok(!/^[-–—]$|^(unknown|n\/?a|tbd|null|undefined)$/i.test(value), `${label}: ${value}`);
    }
    // Released and Updated come from one fetch, so they arrive together or not at all, and a
    // rendered one is always an absolute date in a machine-readable <time>.
    const dated = rows.filter(([l]) => l === 'Released' || l === 'Updated');
    assert.ok(dated.length === 0 || dated.length === 2, 'one date row rendered without the other');
    for (const [label, value, raw] of dated) {
      assert.match(raw, /<time datetime="\d{4}-\d{2}-\d{2}"/, `${label} is not a <time>`);
      assert.match(value, /^\d{1,2} [A-Z][a-z]{2} \d{4}$/, `${label} is not an absolute date: ${value}`);
      assert.ok(!/ago|just now/i.test(value), `${label} is relative: ${value}`);
    }
  });

  test(`${slug}: the sidebar puts no explanatory prose beside a control`, () => {
    const side = /<aside class="side[^"]*"[^>]*>([\s\S]*?)<\/aside>/.exec(pages[slug]);
    assert.ok(side, 'no sidebar element');
    const flatten = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    assert.ok(!/<p[\s>]/.test(side[1]), 'the sidebar contains a paragraph');
    // Outside the metadata list the sidebar says exactly two things, both of them the name of
    // a control: no sentence under the button, no note beside the link, no annotation.
    const chrome = flatten(side[1].replace(/<dl[\s\S]*?<\/dl>/, ''));
    assert.equal(chrome, 'Download How to install', `stray copy in the sidebar: ${chrome}`);
    // And inside it, a row is a label and a value — never a phrase.
    for (const [label, value] of metaRows(pages[slug])) {
      assert.ok(label.split(' ').length <= 2, `the ${label} label is a phrase`);
      assert.ok(value.split(' ').length <= 3, `the ${label} value is a phrase: ${value}`);
      assert.ok(!value.includes(label), `the ${label} value restates its label`);
    }
  });
}

test('a screenshot renders only where one is declared', () => {
  // Written against camera-zoom back when it had no screenshot, which made the test a fact
  // about that mod rather than about the rule. Every mod has one now, so it asserted the
  // opposite of the truth. The rule itself: the slot is filled when the frontmatter names an
  // image and empty when it does not, whichever mods happen to exist.
  for (const slug of slugs) {
    const body = /<div class="body[^"]*"[^>]*>([\s\S]*?)<article/.exec(pages[slug]);
    assert.ok(body, `${slug}: the content column is missing`);

    const declared = readFileSync(new URL(`../mods/${slug}.md`, import.meta.url), 'utf8')
      .split('---')[1]
      .includes('screenshot:');

    if (declared) {
      assert.match(body[1], /<img class="shot"[^>]*src="[^"]+"/, `${slug}: the screenshot is missing`);
    } else {
      assert.equal(body[1].trim(), '', `${slug}: an empty screenshot slot was left behind`);
    }
  }
});

test('the sidebar precedes the article in the markup, so it lands above it on a phone', () => {
  for (const slug of slugs) {
    const html = pages[slug];
    assert.ok(
      html.indexOf('class="side') < html.indexOf('class="prose'),
      `${slug}: the article comes first, so the button would be below the fold on a phone`,
    );
  }
});

test('the mod layout collapses at the same width the guide layout does', () => {
  // Astro's minifier rewrites `max-width: 900px` to the range form `width<=900px`, so accept
  // either spelling — the point of the assertion is the number, shared with Doc.astro.
  const breakpoint = /@media\s*\((?:max-width:\s*900px|width\s*<=\s*900px)\)/;
  for (const slug of slugs) {
    assert.match(pages[slug], breakpoint, `${slug}: not the 900px breakpoint the guides use`);
  }
});
