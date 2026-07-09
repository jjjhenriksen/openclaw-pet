import { execFile } from "node:child_process";
import { copyFile, chmod, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(packageRoot, "dist");

if (process.platform === "darwin") {
  const target = join(distDir, "pet-overlay-macos");
  await mkdir(distDir, { recursive: true });
  await exec("swiftc", [
    join(packageRoot, "overlay", "pet-overlay.swift"),
    "-framework",
    "AppKit",
    "-framework",
    "WebKit",
    "-o",
    target,
  ]);
  await chmod(target, 0o755);
  console.log(`Built macOS overlay helper: ${target}`);
} else if (process.platform === "win32") {
  const runtime = process.arch === "arm64" ? "win-arm64" : process.arch === "ia32" ? "win-x86" : "win-x64";
  const windowsProjectDir = join(packageRoot, "overlay", "windows");
  const publishDir = join(distDir, ".windows-publish");
  const target = join(distDir, "pet-overlay-win.exe");
  await mkdir(distDir, { recursive: true });
  await rm(publishDir, { recursive: true, force: true });
  try {
    await exec(process.env.DOTNET_HOST_PATH ?? "dotnet", [
      "publish",
      join(windowsProjectDir, "OpenClawPetOverlay.csproj"),
      "--configuration",
      "Release",
      "--runtime",
      runtime,
      "--self-contained",
      "true",
      "-p:PublishSingleFile=true",
      "-p:IncludeNativeLibrariesForSelfExtract=true",
      "-p:PublishTrimmed=false",
      "--output",
      publishDir,
    ], { maxBuffer: 10 * 1024 * 1024 });
    await copyFile(join(publishDir, "pet-overlay-win.exe"), target);
  } finally {
    await Promise.all([
      rm(publishDir, { recursive: true, force: true }),
      rm(join(windowsProjectDir, "bin"), { recursive: true, force: true }),
      rm(join(windowsProjectDir, "obj"), { recursive: true, force: true }),
    ]);
  }
  console.log(`Built Windows overlay helper (${runtime}): ${target}`);
} else {
  console.log(`No native overlay helper is built on ${process.platform}; supported build hosts are macOS and Windows.`);
}
