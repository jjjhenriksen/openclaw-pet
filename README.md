# OpenClaw Pet

A native OpenClaw plugin that displays multiple local and remote OpenClaw activity sources as independent transparent desktop pets on macOS and Windows 11.

The display host pulls strict, sanitized snapshots from remote Gateways and serves only allowlisted animation/activity state plus display-host-local sprite assets to the native overlay. Prompts, tool arguments/results, credentials, asset paths, and controller errors never cross the pet bridge.

## Repository layout

- `openclaw-pet/` — installable OpenClaw plugin package.
- `.pet-runs/` — ignored local pet-generation work; never committed.

## Development

```bash
cd openclaw-pet
npm ci --ignore-scripts
npm run validate
```

The development SDK is pinned to OpenClaw 2026.9.1. Platform CI produces macOS ARM64 and Windows x64 validation archives; these are not signed releases or desktop acceptance receipts. See [verification and acceptance](openclaw-pet/VERIFICATION.md).

See [the plugin README](openclaw-pet/README.md) for asset and configuration requirements.

## License

MIT
