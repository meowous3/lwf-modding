# Agent guide: modding Lazy Witch's Factory

Protocol and facts. Human version: `MODDING.md`.

## Target

Unity 6000.0.80f1, Mono, x64.
Plugins: **netstandard2.1**, output `bin/Release/netstandard2.1/`.

| | Full release | Demo |
|---|---|---|
| Steam app | `3971650` | `4638750` |
| Data folder | `LazyWitchsFactory_Data` | `LazyWitchFactory_Data` |
| Executable | `LazyWitchsFactory.exe` | `LazyWitchFactory.exe` |

Note the extra `s`. Locate the folder rather than naming it:

```xml
<GameDataDir>$([System.IO.Directory]::GetDirectories($(GameDir), '*_Data'))</GameDataDir>
```

The apostrophe in the default path does not break this, though it does break any MSBuild
`Condition` referencing the property.

Derived from `0.21.0` and `0.20.1`; verify names against the build you are patching. Every
patch target used by the custom-difficulty plugin resolved unchanged between the two — the
API is stable across the demo boundary, but the **content** is not.

## Protocol

**Decompile before patching.** Unobfuscated. Read the method. Do not infer signatures.

```bash
ilspycmd -p -o "$SRC" -r "$GAME/LazyWitchFactory_Data/Managed" \
  "$GAME/LazyWitchFactory_Data/Managed/Assembly-CSharp.dll"
```

**Verify every patch target by reflection before shipping.** `[HarmonyPatch]` arguments are uncheckable at compile time; wrong ones compile clean and then throw at `PatchAll` or bind nothing.

```csharp
using var mlc = new MetadataLoadContext(
    new PathAssemblyResolver(Directory.GetFiles(managedDir, "*.dll").ToList()), "mscorlib");
var asm = mlc.LoadFromAssemblyPath(Path.Combine(managedDir, "Assembly-CSharp.dll"));
// GetMethod/GetField/GetProperty with BindingFlags (-1), assert non-null
```

Resolver takes only the game's `Managed` folder. Adding the host runtime dir → duplicate `mscorlib` load failure.

**Verifying targets ≠ verifying behaviour.** Every behavioural claim needs a log line from a real run.

**Log the applied value, not the intent.** `TargetProgress={instance.TargetProgress}` catches the inlining failure; `"rules applied"` does not.

## Inlining

Mono inlines small methods. Patches on them are installed, reported applied, never reached.

Confirmed: `WinCondition.CalcTargetProgress` (2 lines) no effect; `CurrencyParams.GetDifficultyMultiplier` (guard + dict + fallback) works. Log showed `TargetProgress=5` while a direct field write in the same postfix took effect.

Load-bearing values: write directly, never via a patch on the computing method.

```csharp
AccessTools.Field(typeof(T), "_field").SetValue(instance, value);
AccessTools.PropertySetter(typeof(T), nameof(T.Prop)).Invoke(instance, new object[] { value });
```

**An interface call cannot be inlined at the call site.** A 9-byte property reached through
an interface-typed reference is a safe patch target where the same property called on the
concrete type is not. Check how the caller is typed before rejecting a small target.

Measured: `WinCondition.IsTimeOver` is **18 bytes and is NOT inlined** on this runtime — the
threshold sits below 18, not at the ~20 often quoted. Confirmed by a patch on it logging from
a real run.

No BepInEx/Doorstop setting disables inlining. Untested: `[UnityMono] debug_enabled = true`.

## Architecture

**Dictionaries keyed by enums** — `FamMaster.ParamsOnBoot`, `HarvestableDB.Configs`, `PactEffectFactoryRegistry._factories`, `IOMappingDistributor.MAPPING_DELEGATES`. Inject entries.

**CSV loaders end by constructing a repository.** Prefix the ctor; validation already ran.

**Item transfer is pull-based.** Receivers call `TryOutputAny`/`TryOutputByID` on senders. `SplitterObject` = `ConveyorObject` + `MainInOtherOut` geometry, no logic.

Some `IOPattern` values are assigned to no fam. Enumerate usage before authoring new geometry.

**Run history validates by enum name (full release only).** `RunHistory` does not exist in
the demo. `RunRecordingService.ValidateStartContext` round-trips the difficulty through
`TryParseDefinedEnumId<Difficulty>`, so a **synthetic enum id crashes the in-game scene load**
— an `ArgumentException` inside `InGameSceneInitializer.DoAfterWipeAsync`, and the scene never
finishes. Static probing does not find this; only a run does.

Exclude rather than bypass. `RunRecordingRuntime.BeginPreparedGameAsync` guards recording with
`if (isRecordingEnabledForCurrentSession && !host.IsTutorialGame)`, so a tutorial prepares a
session and never begins one. Widening `IRunRecordingRuntimeHost.IsTutorialGame` puts a
synthetic run on that same supported path; it has exactly one consumer in the assembly.
Suppressing the validation instead would write an unresolvable id into the player's history.

**Save round-trips sanitise.** `GameData.EnsureSelectedPatrons` → `{Lucifer, Leviathan, Satan}` on any failure, reading private `_unlockedPatrons` directly.

**Content gates are constants, and the full release opens them.** `BuildContentPolicy` in
`0.21.0`: `MaxIncludedDifficulty = 23` (Inferno3), `IncludesSpecialMission`,
`IncludesReckoning` and `IncludesProductPatronUnlocks` all true. Plugins that existed to force
those open in the demo have nothing left to do. `Difficulty` is
`NewCustomer=0, Associate=1, BusinessPartner=2, Invested=3, Takeover=4, Hell1=10, Hell2=15,
Hell3=20, Inferno1=21, Inferno2=22, Inferno3=23` — sparse, so never assume contiguity.

`IsDifficultyIncluded` still rejects a synthetic id through `Enum.IsDefined`, not through the
`MaxIncludedDifficulty` bound, so a postfix on it stays load-bearing even when every vanilla
difficulty is included.

**Synthetic enum values** are invisible to `Enum.IsDefined` and absent from `Enum.GetValues` arrays. For `Difficulty`, three arrays: `DifficultySetter._difficultyValues` (per `Initialize`), `DifficultyUnlockManager.DIFFICULTY_ORDER`, `GameData.DifficultyOrder` (both `private static readonly`, replace by reflection after `PatchAll`).

Grep for range guards (`if (difficulty > X) throw`) before choosing values. One such site sits inside an async state machine and needs a transpiler; picking values below the threshold avoids all of them.

**Compiler-generated names carry ordinals** — `<LoadInGame>b__75_0`, `<SceneInitializeAsync>d__44`. Locate by shape at runtime.

## Probing

`LocalizedTextGetter` returns `"GetTableFailed"` on key miss, `"Not initialized"` before load. Cheap existence test for any key.

**Text presence ≠ implementation.** Localisation tables can describe mechanics that no code implements. Verify against code.

**Signal that a system is real:** concrete classes registered in a factory plus tuned value arrays. `TaxEffectRegistry` — 10 factories over 10 sealed classes with escalating tables — is finished content. A factory whose body throws is not.

## Diagnostics

```ini
[Logging.Disk]   WriteUnityLog  = true
[Preloader]      DumpAssemblies = true
[Harmony.Logger] LogChannels    = Warn, Error, Info
```

Without `WriteUnityLog`, game stack traces never reach your log.

## Human hand-off

In-game verification is theirs: Steam launch, selection, observed behaviour. Structure each hand-off as one launch and one grep, with the exact command and expected output.

Ask for a screenshot when behaviour is in question. Screenshots resolved a missing UI button, an empty panel behind a forced window, and `x5` where `x1000000` was expected — each faster than reading.
