import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SRC = new URL('../src/lib/url.ts', import.meta.url);

// href() reads import.meta.env.BASE_URL, which only exists inside a Vite build,
// and nothing in dist/ exercises it. Load the real source with the base value
// substituted and the type annotations dropped, so these assertions run against
// the shipped implementation rather than a copy of it.
async function load(base) {
  const src = await readFile(SRC, 'utf8');
  const js = src
    .replace('import.meta.env.BASE_URL', JSON.stringify(base))
    .replaceAll(/: string/g, '');
  assert.ok(!js.includes('import.meta.env'), 'BASE_URL substitution did not apply');
  assert.notEqual(js, src, 'source was not rewritten');
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}

// Astro may hand us the base with or without its trailing slash; href() collapses
// duplicate slashes, so every case below must hold for both spellings.
const BASES = ['/lwf-modding', '/lwf-modding/'];

async function each(fn) {
  for (const base of BASES) {
    const { href } = await load(base);
    await fn(href, base);
  }
}

test('href prefixes the base and ends directory routes with a slash', () =>
  each((href) => {
    assert.equal(href(''), '/lwf-modding/');
    assert.equal(href('guides'), '/lwf-modding/guides/');
    assert.equal(href('guides/'), '/lwf-modding/guides/');
    assert.equal(href('/guides'), '/lwf-modding/guides/');
    assert.equal(href('mods/bepinex'), '/lwf-modding/mods/bepinex/');
  }));

test('href leaves a filename alone', () =>
  each((href) => {
    assert.equal(href('style.css'), '/lwf-modding/style.css');
    assert.equal(href('_astro/app.js'), '/lwf-modding/_astro/app.js');
  }));

test('href only treats the last segment as a possible filename', () =>
  each((href) => {
    // A dot in an earlier segment must not suppress the trailing slash.
    assert.equal(href('mods/1.21/notes'), '/lwf-modding/mods/1.21/notes/');
    assert.equal(href('v1.0/guides/install'), '/lwf-modding/v1.0/guides/install/');
  }));

test('href keeps a fragment or query outside the path', () =>
  each((href) => {
    assert.equal(href('guides#top'), '/lwf-modding/guides/#top');
    assert.equal(href('guides/'), '/lwf-modding/guides/');
    assert.equal(href('guides/install#step-2'), '/lwf-modding/guides/install/#step-2');
    assert.equal(href('mods?q=bepinex'), '/lwf-modding/mods/?q=bepinex');
    assert.equal(href('#top'), '/lwf-modding/#top');
    assert.equal(href('style.css?v=2'), '/lwf-modding/style.css?v=2');
  }));
