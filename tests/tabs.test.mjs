import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;

const install = await readFile(join(DIST, 'install/index.html'), 'utf8');
const cssFiles = (await readdir(join(DIST, '_astro'))).filter((f) => f.endsWith('.css'));
const css = (
  await Promise.all(cssFiles.map((f) => readFile(join(DIST, '_astro', f), 'utf8')))
).join('\n');

// Shiki splits a fence into one <span> per token, so no phrase inside a code
// block is ever contiguous in the markup. Strip tags before matching text.
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// The panes of the one tab group on the page, in document order.
const panes = install.split('<section class="tabs-pane"').slice(1);

test('the install page renders one tab group', () => {
  assert.equal((install.match(/<div class="tabs">/g) ?? []).length, 1);
  assert.equal(panes.length, 2, 'a tab group needs both panes in the HTML');
});

test('both panes are in the page, each with its own platform command', () => {
  const [windows, linux] = panes.map(text);
  assert.match(windows, /data-tab="windows"/);
  assert.match(linux, /data-tab="linux-macos"/);
  // The separators are the point of the split: a Windows reader must not be
  // handed a POSIX path, or the other way round.
  assert.ok(
    windows.includes('Select-String "Chainloader started" "<game>\\BepInEx\\LogOutput.log"'),
    'the Windows pane is missing the Select-String command with backslash paths',
  );
  assert.ok(
    linux.includes('grep "Chainloader started" "<game>/BepInEx/LogOutput.log"'),
    'the Linux/macOS pane is missing the grep command with forward-slash paths',
  );
  assert.ok(!windows.includes('grep '), 'the Windows pane leaked the grep command');
  assert.ok(!linux.includes('Select-String'), 'the Linux/macOS pane leaked the PowerShell command');
});

test('a pane keeps its syntax highlighting', () => {
  const [windows, linux] = panes;
  assert.match(windows, /<pre[^>]*data-language="powershell"/, 'the Windows fence lost its language');
  assert.match(linux, /<pre[^>]*data-language="bash"/, 'the Linux/macOS fence lost its language');
  for (const [name, pane] of [
    ['windows', windows],
    ['linux-macos', linux],
  ]) {
    assert.match(pane, /--shiki-light:#[0-9a-fA-F]{3,8}/, `${name} pane has no light palette`);
    assert.match(pane, /--shiki-dark:#[0-9a-fA-F]{3,8}/, `${name} pane has no dark palette`);
    assert.ok(
      (pane.match(/<span style="--shiki-light/g) ?? []).length > 1,
      `${name} pane is one flat token — the highlighter did not run inside it`,
    );
  }
});

test('nothing is hidden without CSS', () => {
  // Every pane is visible in the markup itself: no inline style, no hidden
  // attribute. A reader whose stylesheet never arrives sees both commands
  // rather than an empty box.
  for (const pane of panes) {
    const tag = pane.slice(0, pane.indexOf('>'));
    assert.ok(!/\bhidden\b/.test(tag), `a pane is hidden in the markup: ${tag}`);
    assert.ok(!/display\s*:\s*none/.test(tag), `a pane is hidden in the markup: ${tag}`);
  }
  // And the stylesheet only ever hides a pane from inside a `:has()` rule, so
  // where `:has()` is unsupported the panes stay visible too.
  const hides = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, , body]) => /display:\s*none/.test(body))
    .map(([, selector]) => selector)
    .flatMap((selector) => selector.split(','))
    .filter((selector) => /\.tabs-pane(?![-\w])/.test(selector));
  assert.ok(hides.length > 0, 'the stylesheet never hides a pane — switching cannot work');
  const unconditional = hides.filter((selector) => !selector.includes(':has('));
  assert.deepEqual(unconditional, [], 'these rules hide a pane without a :has() condition');
});

test('the panes are switched by a radio group that spans the page', () => {
  const inputs = [...install.matchAll(/<input[^>]*class="tabs-radio"[^>]*>/g)].map((m) => m[0]);
  assert.equal(inputs.length, 2, 'each pane needs its own radio');
  const attr = (tag, name) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
  const names = new Set(inputs.map((i) => attr(i, 'name')));
  assert.equal(names.size, 1, 'the radios are in different groups, so selection cannot sync');
  assert.equal(inputs.filter((i) => / checked/.test(i)).length, 1, 'exactly one tab opens checked');

  // Every tab is a <label for> pointing at a radio that exists: that is the
  // whole keyboard and screen-reader story, and it is also what makes a click
  // on the tab move the radio.
  const ids = new Set(inputs.map((i) => attr(i, 'id')));
  const labels = [...install.matchAll(/<label[^>]*class="tabs-tab"[^>]*>/g)].map((m) => m[0]);
  assert.equal(labels.length, inputs.length, 'a radio has no tab, or a tab has no radio');
  for (const label of labels) {
    assert.ok(ids.has(attr(label, 'for')), `a tab points at no radio: ${label}`);
  }
});

test('the site still ships no JavaScript of its own', () => {
  assert.ok(
    !/<script(?![^>]*type="application\/ld\+json")/.test(install),
    'the install page grew a <script> — tab switching is meant to be CSS only',
  );
});

const firstMod = await readFile(join(DIST, 'guides/first-mod/index.html'), 'utf8');
const guidePanes = firstMod.split('<section class="tabs-pane"').slice(1);

test('the "find your own targets" guide step renders a tab group with both panes', () => {
  assert.equal((firstMod.match(/<div class="tabs">/g) ?? []).length, 1);
  assert.equal(guidePanes.length, 2, 'a tab group needs both panes in the HTML');
  const [windows, linux] = guidePanes.map(text);
  assert.match(windows, /data-tab="windows"/);
  assert.match(linux, /data-tab="linux-macos"/);
  assert.ok(
    windows.includes('Get-ChildItem -Recurse ./decomp | Select-String "GetDifficultyMultiplier"'),
    'the Windows pane is missing the Get-ChildItem/Select-String command',
  );
  assert.ok(
    linux.includes('grep -rn "GetDifficultyMultiplier" ./decomp'),
    'the Linux/macOS pane is missing the grep command',
  );
  assert.ok(!windows.includes('grep '), 'the Windows pane leaked the grep command');
  assert.ok(!linux.includes('Select-String'), 'the Linux/macOS pane leaked the PowerShell command');
});
