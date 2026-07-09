# OpenClaw Pet

A native OpenClaw plugin that turns a user-supplied Codex-compatible pet atlas into a transparent, always-on-top desktop overlay on macOS and Windows 11.

## Privacy

The plugin reduces OpenClaw lifecycle events to animation names in the platform-neutral pet controller. The native overlay receives only `{ animation, changedAt }` and the local `spritesheet.webp` over an ephemeral HTTP server bound to `127.0.0.1`. It does not receive prompts, tool arguments, tool results, model output, or credentials.

The Windows WebView2 helper only permits navigation to that loopback origin. The macOS and Windows helpers accept the same required arguments: `port`, `size`, and `corner` (plus the optional `clickThrough` value supplied by the plugin).

## Setup

1. Put `pet.json` and a 1536-pixel-wide `spritesheet.webp` with 208-pixel animation rows in a directory you control.
2. Build on the OS where the plugin will run:

   ```bash
   npm install
   npm run build
   ```

3. Install the local package with `openclaw plugins install .`, then configure `plugins.entries.openclaw-pet.config.assetDir` to the absolute asset directory.
4. Restart the Gateway. Use `/pet` for status and `/pet reset` to return the pet to idle.

Example plugin config (use escaped backslashes in JSON on Windows):

```json
{
  "assetDir": "C:\\Users\\you\\openclaw-pet-assets",
  "overlay": {
    "enabled": true,
    "size": 224,
    "corner": "bottom-right",
    "clickThrough": false
  }
}
```

`overlay.clickThrough` is optional and defaults to `false`, preserving the draggable overlay. Set it to `true` to pass pointer input to windows underneath the pet; a click-through pet cannot be dragged, so change its corner in config and restart the Gateway to reposition it.

## Build prerequisites

All platforms require Node.js/npm and the normal OpenClaw development dependencies installed by `npm install`.

- macOS: Xcode Command Line Tools with `swiftc`. `npm run build:overlay` compiles `overlay/pet-overlay.swift` to `dist/pet-overlay-macos`.
- Windows 11: the .NET 8 SDK. `npm run build:overlay` publishes a self-contained WPF helper for the current Node architecture to `dist/pet-overlay-win.exe`; Swift is not required. The Evergreen WebView2 Runtime is part of Windows 11, but stripped-down or managed installations may need Microsoft’s runtime installed separately.
- Other platforms: TypeScript still builds, while the native-overlay step prints a clear no-op message.

Run the full validation commands with:

```bash
npm run build
npm test
npm run plugin:validate
```

## Windows behavior and limitations

The Windows helper uses a borderless WPF window, WebView2 composition rendering, the Win32 topmost/non-activating styles, and an optional transparent input style. It does not appear in the taskbar or intentionally take focus.

- Corner placement currently uses the primary display’s work area.
- With the default `clickThrough: false`, drag anywhere on the pet window to reposition it temporarily.
- With `clickThrough: true`, clicks pass through where Windows permits, but dragging is unavailable.
- The build emits one architecture-specific executable. Rebuild on x64, ARM64, or x86 when distributing to a different architecture.
