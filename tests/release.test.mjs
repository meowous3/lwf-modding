import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadUrl } from '../src/lib/release.ts';

test('the download URL is the permanent redirect, not an API call', () => {
  const url = downloadUrl('meowous3/lwf-custom-difficulty', 'LwfCustomDifficulty.dll');
  assert.equal(url, 'https://github.com/meowous3/lwf-custom-difficulty/releases/latest/download/LwfCustomDifficulty.dll');
  assert.ok(!url.includes('api.github.com'));
});
