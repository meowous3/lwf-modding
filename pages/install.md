---
title: Installing mods
summary: BepInEx, the launch option, and where the .dll goes.
---

Every mod here is a BepInEx 5 plugin, so BepInEx has to be installed first. After that,
installing a mod means copying one file.

## Requirements

[BepInEx 5.4.23.5 `win_x64`](https://github.com/BepInEx/BepInEx/releases/download/v5.4.23.5/BepInEx_win_x64_5.4.23.5.zip). Use the
Windows build on Linux too — the game runs through Proton. BepInEx 6 targets IL2CPP games and
can't load BepInEx 5 plugins, so nothing here will run on it.

## 1. Install BepInEx

Extract the archive into the game folder — the one containing `LazyWitchsFactory.exe`, not a
subfolder. You should end up with `winhttp.dll`, `doorstop_config.ini` and a `BepInEx` folder
beside the executable.

To find that folder, right-click the game in Steam and pick **Properties → Installed Files →
Browse**.

![Steam's game Properties window, with Installed Files selected and the Browse button in the top right](/media/steam-browse.png)

On Linux, add this to the game's Steam launch options:

```
WINEDLLOVERRIDES="winhttp=n,b" %command%
```

Without it BepInEx never loads, and nothing reports an error — the game just runs unmodded.

## 2. Run the game once

Launch it, reach the title screen, quit. This creates `BepInEx/plugins`, which has to exist
before you can install anything. To confirm BepInEx loaded:

:::tabs

**Windows**

```powershell
Select-String "Chainloader started" "<game>\BepInEx\LogOutput.log"
```

**Linux / macOS**

```bash
grep "Chainloader started" "<game>/BepInEx/LogOutput.log"
```

:::

## 3. Install the mod

Put its `.dll` in `BepInEx/plugins/` and start the game.

## Nothing happened

In order of likelihood:

1. **On Linux, the launch option is missing.** No `LogOutput.log` at all is the tell.
2. **BepInEx went into a subfolder.** `winhttp.dll` has to sit beside `LazyWitchsFactory.exe`.
3. **BepInEx 6 instead of 5.** The plugin won't load against a different API.
4. **The `.dll` isn't in `BepInEx/plugins/`.**

If `LogOutput.log` exists, open it — a plugin that failed to load says so by name.

## Uninstalling

Delete the mod's `.dll` from `BepInEx/plugins/`. To remove BepInEx entirely, delete
`winhttp.dll`, `doorstop_config.ini` and the `BepInEx/` folder, and clear the launch option.
