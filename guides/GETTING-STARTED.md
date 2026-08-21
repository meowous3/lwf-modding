# Your first mod

Nothing to a working plugin. Every step ends with something to check.

Needs the [.NET SDK](https://dotnet.microsoft.com/download) 8+ and the game.

## 1. Install BepInEx

Extract **[BepInEx 5.4.23.5, `win_x64`](https://github.com/BepInEx/BepInEx/releases/tag/v5.4.23.5)**
into the game folder — the one with the `.exe`, not a subfolder. Use the Windows build on Linux
too; the game runs under Proton.

BepInEx 6 has a different API. Everything here assumes 5.

```
LazyWitchsFactory.exe
winhttp.dll
doorstop_config.ini
BepInEx/
```

On Linux, add `WINEDLLOVERRIDES="winhttp=n,b" %command%` to the game's Steam launch options.
Without it nothing loads and nothing errors — the game just runs unmodded.

## 2. Run the game once

To the title screen and quit. BepInEx writes its folders on first run.

```bash
grep "Chainloader started" "<game>/BepInEx/LogOutput.log"
```

No log file at all on Linux means the launch option is missing.

In `BepInEx/config/BepInEx.cfg`:

```ini
[Logging.Disk]
WriteUnityLog = true
AppendLog = true
```

`WriteUnityLog` puts the game's own exceptions in your log. `AppendLog` stops each launch
overwriting the last.

## 3. Make a project

```bash
mkdir -p mymod && cd mymod
dotnet new classlib -o src/MyMod -f netstandard2.1
rm src/MyMod/Class1.cs
```

**netstandard2.1**, not 2.0 — the game binds `netstandard 2.1.0.0` and 2.0 fails with `CS1705`.

`Directory.Build.props`:

```xml
<Project>
  <PropertyGroup>
    <GameDir>$(HOME)/.local/share/Steam/steamapps/common/Lazy Witch's Factory</GameDir>

    <!-- Full release is LazyWitchsFactory_Data, demo is LazyWitchFactory_Data. -->
    <GameDataDir>$([System.IO.Directory]::GetDirectories($(GameDir), '*_Data'))</GameDataDir>
    <GameManagedDir>$(GameDataDir)/Managed</GameManagedDir>
    <BepInExCoreDir>$(GameDir)/BepInEx/core</BepInExCoreDir>
  </PropertyGroup>
</Project>
```

`src/MyMod/MyMod.csproj`:

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

`Private=false` on every game reference, or the build copies the game's assemblies next to your
DLL and BepInEx loads the copies.

## 4. Write the plugin

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

The GUID must be unique across installed plugins.

## 5. Build and install

```bash
dotnet build -c Release src/MyMod/MyMod.csproj
cp src/MyMod/bin/Release/netstandard2.1/MyMod.dll "<game>/BepInEx/plugins/"
```

## 6. Check it loaded

```bash
grep "My Mod" "<game>/BepInEx/LogOutput.log"
```

```
[Info   :   BepInEx] Loading [My Mod 0.1.0]
[Info   :    My Mod] My Mod loaded.
```

Only the first line: `Awake` threw, and the exception follows it. Neither line: the DLL is not
in `plugins/`, or it targets the wrong framework.

## 7. Change something

`src/MyMod/DoubleRewards.cs`:

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

Rebuild, copy, run. **Salary** on the difficulty screen reads `x2.00`. The results screen pays
it — both call this method.

`Postfix` runs after the original and can edit `__result`. `Prefix` runs before and skips the
original by returning `false`.

## 8. Find your own targets

The game is not obfuscated, so decompiled names are the real ones.

```bash
dotnet tool install -g ilspycmd
ilspycmd -p -o ./decomp -r "<game>/<data>/Managed" "<game>/<data>/Managed/Assembly-CSharp.dll"
grep -rn "GetDifficultyMultiplier" ./decomp
```

Read the method before patching it. `[HarmonyPatch]` arguments are not compiler-checked — a
wrong one builds clean and binds nothing.

## 9. Three things that waste days

- **A patch that never runs.** Mono inlines small methods; a patch on one reports as applied and
  never fires. Log a value read back off the object, not the value you meant to write.
- **No log on Linux.** The launch option.
- **A save you cannot undo.** Back up `SaveData/` before running anything that writes progression.

Then: [the notes](MODDING.md).
