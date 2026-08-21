---
title: Camera Zoom
repo: meowous3/lwf-camera-zoom
dll: LwfCameraZoom.dll
summary: Ctrl and the scroll wheel move the camera closer to the factory or further back.
gameVersion: "0.21.0"
version: v0.1.0
---

Hold **Ctrl** and scroll to move the camera in or out. **Ctrl+0** puts it back.

Plain scroll still cycles the hotbar.

## Rebinding

The modifier has a row in the game's own **Key Config** screen, listed as *Camera Zoom
Modifier*. Rebinding it there changes both the zoom and the reset, so setting it to Alt gives
you Alt+scroll and Alt+0.

The binding is kept in the plugin's config rather than the game's key config save, so removing
the mod leaves nothing behind.

## Config

`BepInEx/config/dev.meow.lwfcamerazoom.cfg`

| Key | Default | |
|---|---|---|
| `Sensitivity` | `1.6` | Units per scroll notch |
| `MinOffset` | `-55` | Furthest back |
| `MaxOffset` | `16` | Closest in |
| `Smooth` | `true` | Ease instead of snap |

The range is deliberately lopsided. The camera is tilted, so zooming in drops it toward the
ground and stops being useful quickly, while pulling back just widens the view.
