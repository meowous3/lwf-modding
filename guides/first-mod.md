---
title: Your first mod
blurb: From nothing to a plugin you can see working — project, patch, log, iterate.
order: 1
---

From nothing to a plugin you can see working, in about fifteen minutes. Every step ends with
something you can check, so a mistake shows up where it happened rather than three steps later.

You need the [.NET SDK](https://dotnet.microsoft.com/download) (8 or newer), the game, and
BepInEx already working — see [Installing mods](/lwf-modding/install/) if it is not.

Before you start, open `BepInEx/config/BepInEx.cfg` and set:

```ini
[Logging.Disk]
WriteUnityLog = true
AppendLog = true
```

The first sends the game's own exceptions to your log, which you will want the first time
something throws. The second stops each launch from overwriting the last one's evidence.

## 1. Make a project

```bash
mkdir -p mymod/src/MyMod && cd mymod
dotnet new classlib -o src/MyMod -f netstandard2.1
rm src/MyMod/Class1.cs
```

**`netstandard2.1`, not 2.0.** The game binds `netstandard 2.1.0.0`; 2.0 fails to build with
`CS1705`.

`Directory.Build.props` in the root — the game path is the only line you edit:

```xml
<Project>
  <PropertyGroup>
    <GameDir>$(HOME)/.local/share/Steam/steamapps/common/Lazy Witch's Factory</GameDir>

    <!-- Located, not named: the full release is LazyWitchsFactory_Data and the demo is
         LazyWitchFactory_Data. Note the extra s. -->
    <GameDataDir>$([System.IO.Directory]::GetDirectories($(GameDir), '*_Data'))</GameDataDir>
    <GameManagedDir>$(GameDataDir)/Managed</GameManagedDir>
    <BepInExCoreDir>$(GameDir)/BepInEx/core</BepInExCoreDir>
  </PropertyGroup>
</Project>
```

On Windows set `<GameDir>C:\Program Files (x86)\Steam\steamapps\common\Lazy Witch's Factory</GameDir>`.

Replace `src/MyMod/MyMod.csproj` with:

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

`Private=false` on every game reference. Without it the build copies the game's assemblies
next to your DLL, and BepInEx loads those copies instead of the real ones.

## 2. Write the plugin

`src/MyMod/Plugin.cs`:

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

The GUID must be unique across every plugin installed, so use a domain-ish prefix.

## 3. Build and install

```bash
dotnet build -c Release src/MyMod/MyMod.csproj
cp src/MyMod/bin/Release/netstandard2.1/MyMod.dll "<game>/BepInEx/plugins/"
```

## 4. Check it loaded

Run the game to the title screen, quit, then:

```bash
grep "My Mod" "<game>/BepInEx/LogOutput.log"
```

Expected:

```
[Info   :   BepInEx] Loading [My Mod 0.1.0]
[Info   :    My Mod] My Mod loaded.
```

Only the first line means `Awake` threw — the exception is in the log just after it. Neither
line means the DLL is not in `plugins/`, or it targets the wrong framework.

## 5. Change something

Add `src/MyMod/DoubleRewards.cs`:

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

Rebuild, copy, run, and open the difficulty selection screen: **Salary** reads `x2.00` where it
read `x1.00`. The results screen pays it too — both go through this one method.

A `Postfix` runs after the original and can edit `__result`. A `Prefix` runs before and can skip
the original by returning `false`.

## 6. Find your own targets

Decompile the game and read it. It is not obfuscated, so the class and method names are real.

```bash
dotnet tool install -g ilspycmd
ilspycmd -p -o ./decomp -r "<game>/<data>/Managed" "<game>/<data>/Managed/Assembly-CSharp.dll"
grep -rn "GetDifficultyMultiplier" ./decomp
```

Read the method before patching it. Do not guess a signature — `[HarmonyPatch]` arguments are
not checked by the compiler, so a wrong one builds cleanly and then binds nothing.

## 7. Before you trust it

Three things cost more time than everything else combined:

- **A patch that never runs.** Mono inlines small methods, and a patch on an inlined method
  reports as applied and never fires. Log a value you read back from the object, not the value
  you meant to write, so the log distinguishes "it worked" from "it was ignored".
- **A silent Linux install.** No log at all means the launch option in
  [Installing mods](/lwf-modding/install/) was missed, every time.
- **A save you cannot undo.** Anything writing progression deserves checking before you run it
  on a save you care about. Back up `SaveData/` first.

Then read the [notes](reference.md) — the architecture, the seams worth patching, and the traps
found the hard way.
