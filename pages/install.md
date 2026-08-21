---
title: Installing mods
summary: Install BepInEx, then copy each mod's .dll into BepInEx/plugins.
---

## Requirements

- Lazy Witch's Factory, installed through Steam.
- [BepInEx 5.4.23.5 `win_x64`](https://github.com/BepInEx/BepInEx/releases/download/v5.4.23.5/BepInEx_win_x64_5.4.23.5.zip). Use this build on Linux too. The game runs through Proton.
- BepInEx 6 will not work. It targets IL2CPP games. Lazy Witch's Factory is Mono, and BepInEx 6 cannot load BepInEx 5 plugins.

## Install BepInEx

1. In Steam, right-click **Lazy Witch's Factory** and choose **Properties → Installed Files →
   Browse** to open the game folder.

   ![Steam's game Properties window, with Installed Files selected and the Browse button in the top right](/media/steam-browse.png)

2. Extract the zip into the game folder, not into a subfolder of it.

3. Check that `winhttp.dll`, `doorstop_config.ini` and a `BepInEx` folder are now next to
   `LazyWitchsFactory.exe`.

4. **Linux only.** In Steam, right-click the game and choose **Properties → General → Launch
   Options**, then paste in:

   ```
   WINEDLLOVERRIDES="winhttp=n,b" %command%
   ```

5. Start the game, then quit.

## Check it worked

Search `BepInEx/LogOutput.log` for the startup line. Replace `<game>` with the path to the game
folder.

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

## Install a mod

1. Download the mod's `.dll` from its page on this site.

2. Copy the `.dll` into `BepInEx/plugins` in the game folder. Do not put it in a subfolder, and
   do not rename it.

3. Start the game.

To install another mod, copy its `.dll` into the same `BepInEx/plugins` folder.

## Troubleshooting

If the game runs but a mod does nothing, check these in order.

1. **On Linux, the launch option is missing.** Without it BepInEx never loads, the game starts
   normally, and no error appears. `BepInEx/LogOutput.log` is never created.
2. **BepInEx went into a subfolder.** `winhttp.dll` has to sit beside `LazyWitchsFactory.exe`,
   not one folder deeper.
3. **BepInEx 6 is installed instead of BepInEx 5.** Plugins built for BepInEx 5 do not load on
   BepInEx 6. Install 5.4.23.5.
4. **The `.dll` is not in `BepInEx/plugins`.** It does not load from `BepInEx` itself, or from a
   subfolder of `plugins`.

Open `BepInEx/LogOutput.log` if it exists. A plugin that failed to load is named there, with
the error that stopped it.

## Uninstalling

To remove one mod, delete its `.dll` from `BepInEx/plugins`.

To remove BepInEx, delete `winhttp.dll`, `doorstop_config.ini` and the `BepInEx` folder from the
game folder. On Linux, clear the launch option in Steam as well.
