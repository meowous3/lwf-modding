---
title: Custom Difficulty
repo: meowous3/lwf-custom-difficulty
dll: LwfCustomDifficulty.dll
summary: A difficulty whose time limit, repayments, growth curve and taxes you set in-game.
gameVersion: "0.21.0"
version: v0.2.0
screenshot: mods/custom-difficulty.png
screenshotAlt: The difficulty screen with the Custom options panel beside the Custom card
---

Adds a **Custom** difficulty, the leftmost card in the carousel. Set its time limit, repayment
count, growth curve and taxes from the difficulty screen.

Custom runs pay `x0.00` and record nothing — no unlocks, no clears, no run history. You can set
them to be trivially winnable, so they never touch your save.

## Options

| Row | Accepts | Default |
|---|---|---|
| Time Limit | minutes, `0` = none | 30 |
| Repayments | ≥ 1 | 5 |
| First Repayment | ≥ 1 | 10 |
| Growth | Linear / Multiplicative / Exponential | Linear |
| Growth Amount | ≥ 0, decimals allowed | 20 |
| Surcharge | ≥ 0, `0` = off | 500 |
| Surcharge Every | ≥ 1 | 5 |
| Taxes | on / off | off |

Edits apply to the next run. Values persist in
`BepInEx/config/dev.meow.lwfcustomdifficulty.cfg`.

## Growth

The first demand is **First Repayment**. Each one after that:

```
Linear          target += GrowthAmount
Multiplicative  target *= GrowthAmount
Exponential     target += FirstRepayment × GrowthAmount^n
```

then `+= Surcharge` whenever `n` divides evenly by **Surcharge Every**.

In Exponential, Growth Amount is the acceleration — each step is the one before it times that
number. A multiplier below `1` holds the curve flat rather than reducing it. Targets cap at
`536870911`.
