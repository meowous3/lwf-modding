import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateAttr, downloadUrl, formatDate, releaseDates } from '../src/lib/release.ts';

test('the download URL is the permanent redirect, not an API call', () => {
  const url = downloadUrl('meowous3/lwf-custom-difficulty', 'LwfCustomDifficulty.dll');
  assert.equal(url, 'https://github.com/meowous3/lwf-custom-difficulty/releases/latest/download/LwfCustomDifficulty.dll');
  assert.ok(!url.includes('api.github.com'));
});

// `releaseDates` reads the global fetch, so a stub replaces the network entirely: these
// exercise the real function with no request going out and no dependence on GitHub being
// up, rate-limit state, or this machine having a network at all.
function withFetch(impl, run) {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return run();
  } finally {
    globalThis.fetch = real;
  }
}
const ok = (body) => async () => ({ ok: true, json: async () => body });

// Memoisation is per repo and lives for the process, so each case needs its own name.
let n = 0;
const repo = () => `owner/repo-${++n}`;

test('release dates are the oldest and newest published_at', async () => {
  const dates = await withFetch(
    ok([
      { published_at: '2026-08-21T09:00:00Z' },
      { published_at: '2026-06-02T09:00:00Z' },
      { published_at: '2026-07-14T09:00:00Z' },
    ]),
    () => releaseDates(repo()),
  );
  assert.equal(dates.released, '2026-06-02T09:00:00Z');
  assert.equal(dates.updated, '2026-08-21T09:00:00Z');
});

test('a repo is fetched once however many pages ask for it', async () => {
  let calls = 0;
  const name = repo();
  const counting = async () => {
    calls += 1;
    return { ok: true, json: async () => [{ published_at: '2026-08-21T09:00:00Z' }] };
  };
  await withFetch(counting, async () => {
    await Promise.all([releaseDates(name), releaseDates(name)]);
    await releaseDates(name);
  });
  assert.equal(calls, 1, 'the GitHub call was not memoised per repo');
});

test('the request carries a bearer token only when one is in the environment', async () => {
  const seen = [];
  const spy = async (_url, init) => {
    seen.push(init?.headers?.Authorization);
    return { ok: true, json: async () => [] };
  };
  const before = process.env.GITHUB_TOKEN;
  try {
    delete process.env.GITHUB_TOKEN;
    await withFetch(spy, () => releaseDates(repo()));
    process.env.GITHUB_TOKEN = 'tkn';
    await withFetch(spy, () => releaseDates(repo()));
  } finally {
    if (before === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = before;
  }
  assert.deepEqual(seen, [undefined, 'Bearer tkn']);
});

test('every failure is the same answer — null, so the caller can drop the rows', async () => {
  const cases = {
    'no network': async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    },
    'rate limited': async () => ({ ok: false, status: 403, json: async () => ({}) }),
    'no releases yet': ok([]),
    'nothing usable in the payload': ok([{ published_at: null }, {}]),
    'not an array at all': ok({ message: 'Not Found' }),
  };
  for (const [why, impl] of Object.entries(cases)) {
    assert.equal(await withFetch(impl, () => releaseDates(repo())), null, why);
  }
});

test('dates render absolutely, never as a relative phrase that a weekly rebuild would freeze', () => {
  assert.equal(formatDate('2026-08-21T09:00:00Z'), '21 Aug 2026');
  assert.equal(formatDate('2026-01-05T23:30:00Z'), '5 Jan 2026');
  assert.equal(dateAttr('2026-08-21T09:00:00Z'), '2026-08-21');
  assert.ok(!/ago|yesterday|today/i.test(formatDate('2026-08-21T09:00:00Z')));
});
