---
title: Installing mods
summary: BepInEx, the launch option, and where the .dll goes.
---

Every mod here is a **BepInEx 5** plugin. Set BepInEx up once and every mod is a file you drop
in a folder.

## 1. Install BepInEx

Download **[BepInEx 5.4.23.5, `win_x64`](https://github.com/BepInEx/BepInEx/releases/tag/v5.4.23.5)**
and extract it into the game folder — the one with the `.exe` in it, not a subfolder.

Take the Windows build even on Linux. The game runs under Proton, so it is a Windows process.

Right afterwards the folder contains:

```
LazyWitchsFactory.exe
winhttp.dll
doorstop_config.ini
BepInEx/
```

**Version matters.** BepInEx 6 is a different loader with a different API. Every mod here
assumes 5.

## 2. On Linux, set the launch option

Right-click the game in Steam → Properties → Launch Options:

```
WINEDLLOVERRIDES="winhttp=n,b" %command%
```

Without it Proton ignores `winhttp.dll` and **nothing loads, with no error** — the game just
runs unmodded. This is the single most common reason a mod appears to do nothing.

## 3. Run the game once

Start it, reach the title screen, quit. BepInEx generates its folders on first run:

```
BepInEx/config/     BepInEx/core/     BepInEx/plugins/     BepInEx/LogOutput.log
```

Check it loaded:

```bash
grep "Chainloader started" "<game>/BepInEx/LogOutput.log"
```

A hit means BepInEx is running. No `LogOutput.log` at all on Linux means step 2 was missed.

## 4. Install the mod

Put its `.dll` in `BepInEx/plugins/`. That is the whole installation. Start the game.

## Nothing happened

In order of likelihood:

1. **On Linux, the launch option is missing.** No `LogOutput.log` at all is the tell.
2. **BepInEx went into a subfolder.** `winhttp.dll` has to sit beside `LazyWitchsFactory.exe`.
3. **BepInEx 6 instead of 5.** The plugin will not load against a different API.
4. **The `.dll` is not in `BepInEx/plugins/`.**

If `LogOutput.log` exists, open it — a plugin that failed to load says so by name.

## Uninstalling

Delete the mod's `.dll` from `BepInEx/plugins/`. To remove BepInEx entirely, delete
`winhttp.dll`, `doorstop_config.ini` and the `BepInEx/` folder, and clear the launch option.
