# Your first mod

This walks you through building a working mod for Lazy Witch's Factory, from an empty folder to
a change you can see in the game. It should take about fifteen minutes.

Mods for this game are BepInEx plugins written in C#. You don't need to have modded a Unity game
before, but you should be comfortable running commands in a terminal.

You'll need:

- The [.NET SDK](https://dotnet.microsoft.com/download), version 8 or newer
- The game, obviously
- A text editor

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

Without it Proton ignores `winhttp.dll`, so BepInEx never loads and you get no error at all —
the game just runs unmodded. If your mod seems to do nothing later, come back and check this
first.

**Don't use BepInEx 6.** It's a different loader with a different API, and none of the code here
will work on it.

## 2. Run the game once

Launch the game, get to the title screen, then quit. BepInEx creates its folders the first time
it runs, and you need `BepInEx/plugins` to exist before you can install anything.

Check that it actually loaded:

```bash
grep "Chainloader started" "<game>/BepInEx/LogOutput.log"
```

If you get a match, you're good. If there's no `LogOutput.log` at all and you're on Linux, you
missed the launch option in step 1.

While you're in there, open `BepInEx/config/BepInEx.cfg` and change two settings:

```ini
[Logging.Disk]
WriteUnityLog = true
AppendLog = true
```

`WriteUnityLog` sends the game's own exceptions to your log, which you'll want the first time
something crashes. `AppendLog` stops each launch from wiping the previous one's log.

## 3. Set up a project

A plugin is just a class library that references the game's assemblies.

```bash
mkdir -p mymod && cd mymod
dotnet new classlib -o src/MyMod -f netstandard2.1
rm src/MyMod/Class1.cs
```

**Target `netstandard2.1`, not 2.0.** The game binds `netstandard 2.1.0.0`, and if you target 2.0
the build fails with `CS1705`.

Create `Directory.Build.props` in the `mymod` folder. This is where the game's path lives, so
it's the only file you'll need to edit if you move things around:

```xml
<Project>
  <PropertyGroup>
    <GameDir>$(HOME)/.local/share/Steam/steamapps/common/Lazy Witch's Factory</GameDir>

    <!-- The full release uses LazyWitchsFactory_Data and the demo uses LazyWitchFactory_Data,
         so we find the folder instead of naming it. -->
    <GameDataDir>$([System.IO.Directory]::GetDirectories($(GameDir), '*_Data'))</GameDataDir>
    <GameManagedDir>$(GameDataDir)/Managed</GameManagedDir>
    <BepInExCoreDir>$(GameDir)/BepInEx/core</BepInExCoreDir>
  </PropertyGroup>
</Project>
```

On Windows, set `GameDir` to something like
`C:\Program Files (x86)\Steam\steamapps\common\Lazy Witch's Factory`.

Now replace `src/MyMod/MyMod.csproj` with this:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netstandard2.1</TargetFramework>
    <AssemblyName>MyMod</AssemblyName>
  </PropertyGroup>
  <ItemGroup>
    <Reference Include="BepInEx"><HintPath>$(BepInExCoreDir)/BepInEx.dll</HintPath><Private>false</Private></Reference>
    <Reference Include="0Harmony"><HintPath>$(BepInExCoreDir)/0Harmony.dll</HintPath><Private>false</Private></Reference>
    <Reference Include="Assembly-CSharp"><HintPath>$(GameManagedDir)/Assembly-CSharp.dll</HintPath><Private>false</Private></Reference>
    <Reference Include="UnityEngine"><HintPath>$(GameManagedDir)/UnityEngine.dll</HintPath><Private>false</Private></Reference>
    <Reference Include="UnityEngine.CoreModule"><HintPath>$(GameManagedDir)/UnityEngine.CoreModule.dll</HintPath><Private>false</Private></Reference>
  </ItemGroup>
</Project>
```

`Assembly-CSharp.dll` is the game's own code — that's what you'll be patching.

**Note:** every game reference needs `Private=false`. Without it the build copies the game's
assemblies next to your DLL, and BepInEx ends up loading those copies instead of the real ones.

## 4. Write the plugin

Create `src/MyMod/Plugin.cs`:

```csharp
using BepInEx;
using HarmonyLib;

namespace MyMod
{
    [BepInPlugin("dev.you.mymod", "My Mod", "0.1.0")]
    public class Plugin : BaseUnityPlugin
    {
        private void Awake()
        {
            Logger.LogInfo("My Mod loaded.");
            new Harmony("dev.you.mymod").PatchAll();
        }
    }
}
```

`Awake` runs once when BepInEx loads your plugin. `PatchAll()` finds every Harmony patch in your
assembly and applies it — you don't have to register them one by one.

The first argument to `BepInPlugin` is your plugin's GUID, and it has to be unique across every
mod the player has installed. Something like `dev.yourname.modname` is fine.

## 5. Build and install

```bash
dotnet build -c Release src/MyMod/MyMod.csproj
cp src/MyMod/bin/Release/netstandard2.1/MyMod.dll "<game>/BepInEx/plugins/"
```

Run the game to the title screen, quit, and check the log:

```bash
grep "My Mod" "<game>/BepInEx/LogOutput.log"
```

You should see both of these:

```
[Info   :   BepInEx] Loading [My Mod 0.1.0]
[Info   :    My Mod] My Mod loaded.
```

If you only get the first line, your `Awake` threw an exception — it'll be in the log right
after. If you get neither, the DLL isn't in `plugins/`, or it's built against the wrong
framework.

## 6. Actually change something

Time to patch a method. Create `src/MyMod/DoubleRewards.cs`:

```csharp
using HarmonyLib;
using Unlocks;

namespace MyMod
{
    [HarmonyPatch(typeof(CurrencyParams), nameof(CurrencyParams.GetDifficultyMultiplier))]
    internal static class DoubleRewards
    {
        private static void Postfix(ref float __result) => __result *= 2f;
    }
}
```

`CurrencyParams.GetDifficultyMultiplier` is the game's own method for working out how much a run
pays. A **postfix** runs straight after the original and can change what it returned — `__result`
is the return value, and Harmony gives it to you by reference so you can edit it. A **prefix**
runs before instead, and can skip the original entirely by returning `false`.

Rebuild, copy the DLL over, and open the difficulty selection screen. **Salary** now reads
`x2.00` instead of `x1.00`, and the results screen pays double at the end of a run — both of them
call that one method.

That's a complete mod. Everything else is finding better methods to patch.

## 7. Finding your own targets

The game isn't obfuscated, so you can decompile it and read real class and method names.

```bash
dotnet tool install -g ilspycmd
ilspycmd -p -o ./decomp -r "<game>/<data>/Managed" "<game>/<data>/Managed/Assembly-CSharp.dll"
```

Then just grep for whatever you're after:

```bash
grep -rn "GetDifficultyMultiplier" ./decomp
```

Read the method before you patch it. The arguments you pass to `[HarmonyPatch]` aren't checked by
the compiler, so if you get a name or a signature wrong it'll build perfectly and then quietly
patch nothing.

## Three things that will waste your time

**Your patch runs but nothing happens.** Mono inlines small methods, and once a method is inlined
your patch never gets reached — Harmony still reports it as applied. If a patch seems to do
nothing, this is usually why. Log a value you've read back off the object rather than the value
you meant to write, so you can tell the difference.

**Nothing loads on Linux.** It's the launch option in step 1, every time.

**You break a save you cared about.** Back up your save folder before running anything that
touches progression. It lives under
`compatdata/<appid>/pfx/.../LocalLow/MELTCLOCK/LazyWitchFactory/SaveData/` on Linux.

Once you're comfortable, the [notes](MODDING.md) cover how the game is put together and the
traps that took longest to find.
