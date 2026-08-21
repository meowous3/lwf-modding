---
title: Modding reference
blurb: What the game is made of and where it gives way — architecture, the seams worth patching, and the traps found the hard way.
order: 2
---

What the game is made of and where it gives way. Assumes a plugin that already loads — if you
do not have one yet, start with [Your first mod](first-mod.md).

Unity 6000.0.80f1, Mono, x64. Steam app `3971650` (demo: `4638750`).

Derived from `0.21.0` and `0.20.1`; class and member names may shift between versions.

## Setup

BepInEx **5.4.23.5**, **win_x64** build.

Linux Steam launch options:

```
WINEDLLOVERRIDES="winhttp=n,b" %command%
```

Plugins target **netstandard2.1**. 2.0 fails with `CS1705`.

Reference game assemblies with `Private=false`.

Decompile (unobfuscated):

```bash
ilspycmd -p -o ./src -r "<game>/LazyWitchFactory_Data/Managed" \
  "<game>/LazyWitchFactory_Data/Managed/Assembly-CSharp.dll"
```

## Architecture

Dictionaries keyed by enums, holding data or prefab address strings.

```csharp
// FamMaster — Farmer and Caretaker share a prefab, differ in parameters
{ FamType.Farmer, new FamCommonParamsOnBoot(
      "Assets/Prefab/Fams/CaretakerPivot.prefab", "...Preview.prefab",
      1f, "Summon-Farmer", 10, 10, IOPattern.MainHarvestInBackOut, ...) },
```

## Seams

| System | Patch |
|---|---|
| Pacts | prefix `PactMasterRepository` ctor |
| Recipes | prefix `RecipeMasterRepository` ctor |
| Orders | postfix `OrderCsvLoader.Load`, append to list |
| Difficulties | synthetic enum + replace 3 order arrays |
| Items | `ScriptableObject.CreateInstance<Item>()` → `ItemDB` collections |
| Text | postfix `LocalizedTextGetter.*` |

CSV master data loads via Addressables; each loader ends by constructing a repository. Prefix that ctor — validation runs before it.

Loaders: `PactMasterCsvLoader`, `RecipeMasterCsvLoader`, `OrderCsvLoader`, `SpecialMissionMasterCsvLoader`, `TelephoneMasterCsvLoader`, `TradeObjectMasterCsvLoader`, 3× `UniqueObject*TableCsvLoader`.

## Item transfer

Pull-based: receivers call `TryOutputAny`/`TryOutputByID` on senders. Senders never route.

`SplitterObject` is `ConveyorObject` plus `IOPattern.MainInOtherOut` geometry, with no logic of its own.

`IOPattern` has values not assigned to any fam — check before authoring new geometry.

## Traps

**Mono inlines small methods; Harmony patches on them never fire.** The patch reports as applied. `WinCondition.CalcTargetProgress` (2 lines) failed; `CurrencyParams.GetDifficultyMultiplier` (guard + lookup + fallback) worked.

Write the value instead:

```csharp
AccessTools.Field(typeof(WinCondition), "_timeLimit").SetValue(instance, 0f);
AccessTools.PropertySetter(typeof(WinCondition), nameof(WinCondition.TargetProgress))
    .Invoke(instance, new object[] { 9_999_999 });
```

**Save round-trips sanitise.** `GameData.EnsureSelectedPatrons` replaces the whole selection with `{Lucifer, Leviathan, Satan}` if any member fails validation, reading private `_unlockedPatrons` directly. In-memory changes that skip the save path get reverted.

**Compiler-generated names carry ordinals** — `<LoadInGame>b__75_0`, `<SceneInitializeAsync>d__44`. Find by shape at runtime, not by literal name.

**Synthetic enum values** are invisible to `Enum.IsDefined` and absent from arrays built by `Enum.GetValues`. For `Difficulty` there are three: `DifficultySetter._difficultyValues` (rebuilt per `Initialize`), `DifficultyUnlockManager.DIFFICULTY_ORDER` and `GameData.DifficultyOrder` (both `private static readonly`, replaceable by reflection after `PatchAll`).

Check for range guards before choosing values — comparisons like `if (difficulty > X) throw` will reject values above a threshold, one of them inside an async state machine that needs a transpiler.

## Art

1. Reuse a prefab, change parameters
2. Runtime: PNG → `Texture2D.LoadImage` → `Sprite.Create`; `GameObject` + `AddComponent`
3. AssetBundle: Unity 6000.0.80f1, StandaloneWindows64, `AssetBundle.LoadFromFile`, patch `AddressablesLoader.LoadAssetAsync`

Characters use Spine. Reskinning an existing skeleton's atlas keeps all animations.

## Diagnostics

`BepInEx/config/BepInEx.cfg`:

```ini
[Logging.Disk]   WriteUnityLog  = true
[Preloader]      DumpAssemblies = true
[Harmony.Logger] LogChannels    = Warn, Error, Info
```

`doorstop_config.ini`: `[UnityMono] debug_enabled = true` → Mono debugger on `127.0.0.1:10000`.

No setting disables inlining. `HarmonyBackend` is for old-Mono `Reflection.Emit` gaps.

`LocalizedTextGetter` returns `"GetTableFailed"` on a key miss and `"Not initialized"` before the tables load — useful for testing whether a key exists.
