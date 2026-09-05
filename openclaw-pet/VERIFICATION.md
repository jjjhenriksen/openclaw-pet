# Verification and support boundaries

## Reproduce from a clean checkout

Use Node 24.15.0, npm 11.12.1, and run inside `openclaw-pet/`:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run validate
```

macOS needs Xcode Command Line Tools. Windows needs the exact .NET SDK in
`global.json`. npm dependencies are locked in `package-lock.json`; the Windows
NuGet graph is locked in `overlay/windows/packages.lock.json`. Windows builds
restore in locked mode and fail on dependency drift. Build on the target OS and
architecture. Each archive contains only that host's helper.

The workflow runs on macOS 15 ARM64 and Windows Server 2025 x64. It checks the
TypeScript build against OpenClaw 2026.9.1, all unit tests (including bridge
privacy and lifecycle regressions), native compilation, real npm archive
creation, required contents, executable headers, and compiled SDK entry import.
It saves archives as Actions artifacts, without publishing or releasing them.
A green Windows build does not establish Windows 11 desktop behavior. Other
OpenClaw versions and Windows ARM64/x86 are not covered by this gate.

The OS images, Apple SDK, and Evergreen WebView2 runtime can change independently.
The lockfiles establish a reproducible dependency graph, not bit-identical
native binaries. Keep the platform/architecture and Actions commit attached to
any distributed archive; build-host macOS deployment defaults also apply.

## Local native smoke check

After building, run `npm run smoke:macos` in an interactive macOS desktop session.
It briefly launches two isolated native helpers, uses temporary files and
random loopback ports, then cleans up only its own processes and servers. It
never loads OpenClaw configuration or connects to the installed Gateway.

The probe serves the actual compiled renderer to WebKit, checks real polling,
compares the foreground application before/after launch, exercises remote HTTP
disconnection, closes the service normally, then removes a second helper's
server to exercise its real watchdog. If the user switches applications during
the probe, focus preservation is reported as inconclusive. Before/after focus
sampling cannot rule out a transient focus change.

Recorded locally on September 4, 2026: macOS 26 ARM64, Swift 6.2, Node 24.15.0,
npm 11.12.1, OpenClaw 2026.9.1. Clean `npm ci` succeeded; 56 tests and macOS
build/package checks passed. A Windows x64 cross-publish also succeeded with .NET
10.0.400 and locked NuGet restore on macOS; this is compiler evidence, not a
Windows runtime result. Missing native helpers and stale opposite-platform
helpers were deliberately introduced and correctly rejected by `pack:check`.
Native smoke results:

| Check | Evidence |
| --- | --- |
| Native renderer polling | WebKit made at least three real `/state` requests per launch |
| Launch focus | Foreground application unchanged before/after both launches |
| Remote disconnect | Real loopback HTTP failure marked source unavailable and retained validated state |
| Normal service stop | Helper exited and loopback server closed |
| Host-server loss | Native watchdog exited normally after approximately 10.1 seconds |

This uses synthetic state and no user artwork. It is not proof of a live
Gateway stop/crash, visual animation quality, or pointer interaction.

## Release acceptance receipt

Run these checks on an isolated Gateway/profile and record the commit, OpenClaw
version, OS, architecture, native compiler/runtime versions, and observed result.
Do not use the live installation as a test fixture. Do not mark a row passed
from source inspection or mocked tests alone.

| Desktop check | macOS | Windows 11 |
| --- | --- | --- |
| Launch without focus theft | Local sampled smoke passed; full desktop acceptance pending | Pending |
| Drag visible pet without activation | Pending | Pending |
| Hide pets, drag bubble, click Show pets | Pending | Pending |
| Click-through reaches underlying app and disables dragging | Pending | Pending |
| Remote disconnect visibly shows unavailable state | Transport passed; visual check pending | Pending |
| Normal Gateway stop removes all helpers | Service stop passed; isolated Gateway check pending | Pending |
| Forced Gateway exit removes helpers within about 10 seconds | Server-loss watchdog passed; isolated Gateway check pending | Pending |
| Transparency, animation, resize, multiple sources | Pending | Pending |

## Updating dependencies

Update the exact OpenClaw dev/peer pins together only after verifying the new SDK.
Regenerate `package-lock.json` with the pinned npm, rerun both platform jobs, and
record desktop acceptance separately. Do not replace the SDK pin with `latest`.
For a deliberate Windows dependency/SDK update, edit `global.json`/the project,
then regenerate the NuGet lock with the same publish properties:

```sh
dotnet publish overlay/windows/OpenClawPetOverlay.csproj --configuration Release --runtime win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:PublishTrimmed=false -p:RestoreForceEvaluate=true
```

Commit manifest and lockfile changes together. The regular build enforces
`RestoreLockedMode=true`; do not disable it to bypass a failing CI restore.
