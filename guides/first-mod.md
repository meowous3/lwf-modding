---
title: Your first mod
blurb: From nothing to a plugin you can see working — project, patch, log, iterate.
order: 1
---

Mods for Lazy Witch's Factory are BepInEx plugins: C# class libraries that patch the game's own
methods at runtime with [Harmony](https://harmony.pardeike.net/). This takes you from an empty
folder to a working mod.

## Requirements

- [.NET SDK](https://dotnet.microsoft.com/download) 8 or newer
- BepInEx already set up — see [Installing mods](../pages/install.md)

## 1. Create the project

```bash
mkdir mymod
cd mymod
dotnet new classlib -o src/MyMod -f netstandard2.1
rm src/MyMod/Class1.cs
```

Target `netstandard2.1`. The game binds `netstandard 2.1.0.0`, and 2.0 fails with `CS1705`.

`Directory.Build.props`, where the game path lives:

```xml
<Project>
  <PropertyGroup>
    <GameDir>$(HOME)/.local/share/Steam/steamapps/common/Lazy Witch's Factory</GameDir>

    <!-- Full release: LazyWitchsFactory_Data. Demo: LazyWitchFactory_Data. -->
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

`Assembly-CSharp.dll` is the game's code. Keep `Private=false` on every game reference, or the
build copies those assemblies next to your DLL and BepInEx loads the copies.

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

`PatchAll()` applies every Harmony patch in the assembly. The first argument to `BepInPlugin` is
the plugin GUID and must be unique across the player's installed mods.

## 3. Build and install

```bash
dotnet build -c Release src/MyMod/MyMod.csproj
cp src/MyMod/bin/Release/netstandard2.1/MyMod.dll "<game>/BepInEx/plugins/"
```

Run the game, quit, and check the log for both lines:

```
[Info   :   BepInEx] Loading [My Mod 0.1.0]
[Info   :    My Mod] My Mod loaded.
```

Only the first means `Awake` threw, and the exception follows it in the log.

## 4. Patch a method

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

A postfix runs after the original and can edit `__result`, its return value. A prefix runs
before, and returning `false` skips the original.

Rebuild, copy, launch. **Salary** on the difficulty screen reads `x2.00`, and runs pay double —
both read this method.

## 5. Find your own targets

The game isn't obfuscated, so decompiled names are the real ones.

```bash
dotnet tool install -g ilspycmd
ilspycmd -p -o ./decomp -r "<game>/<data>/Managed" "<game>/<data>/Managed/Assembly-CSharp.dll"
```

:::tabs

**Windows**

```powershell
Get-ChildItem -Recurse ./decomp | Select-String "GetDifficultyMultiplier"
```

**Linux / macOS**

```bash
grep -rn "GetDifficultyMultiplier" ./decomp
```

:::

Read a method before patching it. `[HarmonyPatch]` arguments aren't compiler-checked, so a wrong
name or signature builds clean and patches nothing.

## Troubleshooting

**The patch applies but nothing changes.** Mono inlines small methods, and a patch on an inlined
method never runs while still reporting as applied. Log a value read back off the object rather
than the one you meant to write.

**Back up your save** before running anything that touches progression. On Linux it's under
`compatdata/<appid>/pfx/.../LocalLow/MELTCLOCK/LazyWitchFactory/SaveData/`.

## Further reading

The [reference](reference.md) covers the game's architecture, the methods worth patching,
and the traps that took longest to find.
