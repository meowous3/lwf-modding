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
