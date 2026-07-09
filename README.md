# OpenClaw Pet

A native OpenClaw plugin that displays a user-supplied, Codex-compatible animated pet as a transparent desktop overlay on macOS and Windows 11.

The plugin observes sanitized OpenClaw lifecycle events and maps them to pet animations; the overlay receives only animation state and local sprite assets, never prompts, tool arguments, results, or credentials.

## Repository layout

- `openclaw-pet/` — installable OpenClaw plugin package.
- `.pet-runs/` — ignored local pet-generation work; never committed.

## Development

```bash
cd openclaw-pet
npm install
npm run build
npm test
```

See [the plugin README](openclaw-pet/README.md) for asset and configuration requirements.

## License

MIT
