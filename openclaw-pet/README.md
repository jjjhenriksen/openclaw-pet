# OpenClaw Pet

A native OpenClaw plugin that turns user-supplied Codex-compatible pet atlases into transparent, always-on-top desktop pets on macOS and Windows 11. A display can combine its local OpenClaw activity with activity pulled from remote OpenClaw Gateways.

## Privacy

The plugin reduces OpenClaw lifecycle events to display-only pet state in the platform-neutral controller. Its versioned Gateway bridge exposes only an allowlisted `{ animation, changedAt, activityLabel, activity }` snapshot. Activity labels are generated from fixed lifecycle phases and validated tool names; prompts, tool arguments, tool results, model output, arbitrary event titles/statuses, credentials, asset paths, and controller errors never enter a bridge snapshot.

Remote sources are pull-only: the display host periodically fetches the remote plugin's gateway-authenticated `/api/openclaw-pet/v1/snapshot` bridge endpoint and validates the complete response against the strict bridge contract. A response containing unknown fields is rejected. Gateway credentials are resolved from the display host's environment and used only for Gateway authentication. Token-authenticated remote sources must use HTTPS; loopback HTTP is accepted only for local development and SSH tunnels.

The native overlay receives source IDs, display labels, availability, sanitized pet state, layout, and locally hosted sprite sheets over an ephemeral HTTP server bound to `127.0.0.1`. Every source's `assetDir` is a display-host-local setting and never appears in either the Gateway bridge or renderer state JSON.

The Windows WebView2 helper only permits navigation to that loopback origin and the internal watchdog/resize signals. The macOS and Windows helpers accept the same arguments and resize each pet window when the display host changes its runtime size.

Both native helpers load the same renderer from the loopback server. If that renderer cannot reach `/state` for 10 consecutive seconds, its watchdog asks the native helper to exit so a Gateway crash cannot leave an orphaned pet running indefinitely.

## Setup

1. For each displayed pet, put `pet.json` and a 1536-pixel-wide `spritesheet.webp` with 208-pixel animation rows in a directory on the display host.
2. Build on the OS where the plugin will run:

   ```bash
   npm install
   npm run build
   ```

3. Install the local package with `openclaw plugins install .`, then enable conversation access for the plugin and configure `plugins.entries.openclaw-pet.config`.
4. Restart the Gateway. Use `/pet` for status, `/pet reset` to return the local pet to idle, `/pet resize 288` to resize all pets, and `/pet resize server 320` to resize one source at runtime.

Example plugin config (use escaped backslashes in JSON on Windows):

```json
{
  "assetDir": "C:\\Users\\you\\openclaw-pet-assets",
  "overlay": {
    "enabled": true,
    "size": 224,
    "corner": "bottom-right",
    "showStatus": false,
    "clickThrough": false
  }
}
```

Example plugin entry:

```json
{
  "plugins": {
    "entries": {
      "openclaw-pet": {
        "enabled": true,
        "hooks": {
          "allowConversationAccess": true
        },
        "config": {
          "assetDir": "C:\\Users\\you\\openclaw-pet-assets",
          "overlay": {
            "enabled": true,
            "size": 224
          }
        }
      }
    }
  }
}
```

`hooks.allowConversationAccess` lets OpenClaw deliver the lifecycle events needed for completion/failure states. The legacy `assetDir` form remains supported and creates one source named `local`.

## Multiple local and remote sources

Configure `sources` on the machine that owns the desktop display. A source without `gateway` follows the display host's local controller. A source with `gateway` is pulled from that remote OpenClaw installation. Every `assetDir`, including a remote source's pet art, is a path on the display host:

```json
{
  "sources": [
    {
      "id": "laptop",
      "label": "Laptop",
      "assetDir": "/Users/you/pets/laptop"
    },
    {
      "id": "server",
      "label": "Build server",
      "assetDir": "/Users/you/pets/server",
      "size": 288,
      "gateway": {
        "url": "https://openclaw.example.test/api/openclaw-pet/v1/snapshot",
        "tokenEnv": "OPENCLAW_BUILD_SERVER_TOKEN",
        "pollIntervalMs": 1000,
        "timeoutMs": 5000
      }
    }
  ],
  "overlay": {
    "enabled": true,
    "size": 224,
    "corner": "bottom-right",
    "clickThrough": false
  }
}
```

Install and enable the plugin on each remote source Gateway. A source-only host can set `overlay.enabled` to `false` and does not need local pet assets; lifecycle events still drive its sanitized bridge snapshot. Put the token itself only in the display host environment variable named by `tokenEnv`. Token-authenticated bridge URLs must be `https://` unless they are loopback `http://` URLs used for local development or SSH tunnels.

Every display source needs display-host-local assets, either through source-level `assetDir` or top-level `assetDir`. Invalid source IDs, missing asset paths, invalid display assets, and unsafe token transports are skipped with a startup warning.

The display retains the last validated remote animation data but visibly marks a source unavailable whenever polling fails or returns a non-conforming snapshot. Polling never overlaps for a given source: the next poll is scheduled after the previous request finishes.

Each configured source is rendered in its own native helper window. Multiple pets start near the configured corner with a small stagger, then can be dragged independently when `overlay.clickThrough` is `false`.

## Runtime sizing

`overlay.size` sets the startup size from 96 through 768 pixels. A source can set its own startup size with `sources[].size`. On a display host, change every current source without restarting through the write-scoped Gateway method:

```bash
openclaw gateway call openclaw-pet.resize --params '{"size":288}'
```

Resize one display source with `sourceId`:

```bash
openclaw gateway call openclaw-pet.resize --params '{"sourceId":"server","size":320}'
```

The equivalent chat commands are `/pet resize 288` and `/pet resize server 320`. Runtime resizing also recomputes the initial stagger offsets so pets do not overlap after a size change; if you manually dragged a pet, a later resize may move it back near the configured corner. Runtime sizing is intentionally not part of `openclaw-pet.bridge.snapshot`; a source Gateway cannot change a display host's layout through the bridge. Runtime changes are in-memory and the configured `overlay.size` / `sources[].size` values are used again after restart.

`overlay.clickThrough` is optional and defaults to `false`, preserving draggable pet windows. Set it to `true` to pass pointer input to windows underneath the pets; click-through pets cannot be dragged, so change the corner in config and restart the Gateway to reposition them.

`overlay.showStatus` is optional and defaults to `true`. Set it to `false` to hide the status and recent-activity panel while keeping the animated pet visible. Hidden status panels do not leave an invisible interactive area beside the pet.

## Build prerequisites

All platforms require Node.js/npm and the normal OpenClaw development dependencies installed by `npm install`.

- macOS: Xcode Command Line Tools with `swiftc`. `npm run build:overlay` compiles `overlay/pet-overlay.swift` to `dist/pet-overlay-macos`.
- Windows 11: the .NET 10 LTS SDK. `npm run build:overlay` publishes a self-contained WPF helper for the current Node architecture to `dist/pet-overlay-win.exe`; Swift is not required. The Evergreen WebView2 Runtime is part of Windows 11, but stripped-down or managed installations may need Microsoft’s runtime installed separately.
- Other platforms: TypeScript still builds, while the native-overlay step prints a clear no-op message.

Run the full validation commands with:

```bash
npm run build
npm test
npm pack --dry-run
openclaw plugins inspect openclaw-pet --runtime --json
openclaw plugins doctor
```

Run the two `openclaw` inspection commands after installing or linking the plugin. `openclaw plugins build` and `openclaw plugins validate` intentionally validate generated `defineToolPlugin` metadata and do not apply to this `definePluginEntry` service plugin. General static validation for `definePluginEntry` would be an upstream enhancement, not a blocker for this package.

## Windows behavior and limitations

The Windows helper uses a borderless WPF window, WebView2 composition rendering, the Win32 topmost/non-activating styles, and an optional transparent input style. It does not appear in the taskbar or intentionally take focus.

- Corner placement currently uses the primary display’s work area.
- With the default `clickThrough: false`, drag any pet to reposition that pet temporarily; its adjacent activity panel remains interactive when `showStatus` is enabled.
- With `clickThrough: true`, clicks pass through where Windows permits, but dragging is unavailable.
- The build emits one architecture-specific executable. Rebuild on x64, ARM64, or x86 when distributing to a different architecture.

Before release, manually smoke-test on Windows 11:

- Launching the overlay does not move focus away from the foreground application.
- Dragging the default overlay does not activate it or switch the foreground application.
- With `clickThrough: true`, pointer input reaches an unrelated application underneath the overlay.
- Stop the Gateway and confirm the helper disappears; force-terminate the Gateway and confirm the watchdog closes the helper within about 10 seconds.

Before release, manually smoke-test on macOS:

- Each loopback renderer is transparent, animates, and remains draggable by default.
- `clickThrough: true` passes input through and disables dragging.
- Normal Gateway stop closes the helper, and the watchdog closes it after a forced Gateway termination.
