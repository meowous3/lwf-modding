# Lazy Witch's Factory — modding

Notes from modding **Lazy Witch's Factory** with BepInEx 5. Unity 6000.0.80f1, Mono, x64.

**https://meowous3.github.io/lwf-modding/**

- [`pages/install.md`](pages/install.md) — installing mods. Start here if you just want to play.
- [`guides/first-mod.md`](guides/first-mod.md) — nothing to a working plugin, step by step.
- [`guides/reference.md`](guides/reference.md) — how the game is put together and where it gives way.
- [`guides/agents.md`](guides/agents.md) — the same ground as protocol, for coding agents.

## Mods

| | |
|---|---|
| [lwf-custom-difficulty](https://github.com/meowous3/lwf-custom-difficulty) | A difficulty whose time limit, repayments, growth curve and taxes you set in-game. |

## Adding to the site

A mod is a Markdown file in [`mods/`](mods); a guide is one in [`guides/`](guides). Both are
plain frontmatter plus prose — see an existing file. Download links resolve to each repo's
latest release automatically, so publishing a release is enough.

```bash
npm install
npm run dev     # local preview
npm test        # build, then verify the built output
```

## Licence

MIT.
