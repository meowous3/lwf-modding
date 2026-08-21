---
title: Installing mods
summary: BepInEx, the launch option, and where the .dll goes.
---

Every mod here is a **BepInEx 5** plugin. Set BepInEx up once and every mod is a file you drop
in a folder.

## 1. Install BepInEx

BepInEx is the mod loader. It hooks into the game at startup and loads any plugin DLLs you've
put in its `plugins` folder.

Download [BepInEx 5.4.23.5, `win_x64`](https://github.com/BepInEx/BepInEx/releases/tag/v5.4.23.5)
and extract it into your game folder — the one with `LazyWitchsFactory.exe` in it, not a
subfolder. If you're on Linux, still grab the Windows build; the game runs through Proton, so
it's a Windows process either way.

When you're done the folder should look like this:

```
LazyWitchsFactory.exe
winhttp.dll
doorstop_config.ini
BepInEx/
```

**Linux users:** right-click the game in Steam, open Properties, and put this in Launch Options:

```
WINEDLLOVERRIDES="winhttp=n,b" %command%
```

Without it Proton ignores `winhttp.dll`, so BepInEx never loads — and it fails silently, with
no error anywhere. The game just runs unmodded.

**Stick with BepInEx 5.** You might see BepInEx 6 around — that's for IL2CPP games, and this one
is Mono, so 5 is what you want on Windows and Linux alike. 6 is also still a pre-release and
can't load BepInEx 5 plugins, so the mods here won't run on it. 5 is in long-term support and
isn't going anywhere.

## 2. Run the game once

Launch the game, get to the title screen, then quit. BepInEx creates its folders the first time
it runs, and you need `BepInEx/plugins` to exist before you can install anything.

Check that it actually loaded. Open `BepInEx/LogOutput.log` and look for a line reading
`Chainloader started`. From a terminal, on Windows:

```powershell
Select-String "Chainloader started" "<game>\BepInEx\LogOutput.log"
```

On Linux or macOS:

```bash
grep "Chainloader started" "<game>/BepInEx/LogOutput.log"
```

A match means BepInEx is running. If there's no `LogOutput.log` at all and you're on Linux, you
missed the launch option in step 1.

## 3. Install the mod

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
