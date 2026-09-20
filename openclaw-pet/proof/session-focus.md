# Session-focus proof

This proof uses the real macOS native overlay helper and WebKit renderer with
synthetic, sanitized activity records. It does not contact a live Gateway or
open a real private session.

## Observed behavior

- Three renderer rows are visible: `Nightly Research · research`,
  `Release Planning · main`, and `Shape-Note Atlas · main`.
- Each row shows the validated tool name (`shell`, `apply_patch`, or
  `web_search`) and the operator-facing state.
- The single source does not add a `Local Gateway` prefix.
- The trusted host endpoint resolves the opaque id
  `run_aaaaaaaaaaaaaaaaaaaa` to a loopback Control UI URL; the renderer never
  receives a raw session key.

## Reproduce

```text
npm run build
node scripts/proof-activity-tray.mjs
```

The proof script starts the native helper, verifies `/open-run` returns the
expected loopback URL, and prints the sanitized `/state` payload. The attached
`session-focus-tray.png` is a desktop capture of the floating overlay over an
unrelated application.
