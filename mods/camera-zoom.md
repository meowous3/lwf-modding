---
title: Camera Zoom
repo: meowous3/lwf-camera-zoom
dll: LwfCameraZoom.dll
summary: Ctrl and the scroll wheel move the camera closer to the factory or further back.
gameVersion: "0.21.0"
screenshot: mods/camera-zoom.png
screenshotAlt: A factory seen zoomed out, with the whole plot visible
---

Hold **Ctrl** and scroll to move the camera in or out. **Ctrl+0** puts it back.

Plain scroll still cycles the hotbar.

## Rebinding

The modifier has a row in the game's **Key Config** screen, listed as *Camera Zoom Modifier*.
Rebinding it changes the reset too — set it to Alt and you get Alt+scroll and Alt+0.

## Config

`BepInEx/config/dev.meow.lwfcamerazoom.cfg`

| Key | Default | |
|---|---|---|
| `Sensitivity` | `1.6` | Units per scroll notch |
| `MinOffset` | `-55` | Furthest back |
| `MaxOffset` | `16` | Closest in |
| `Smooth` | `true` | Ease instead of snap |
