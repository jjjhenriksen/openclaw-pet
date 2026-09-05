import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

// Pack for real: a dry run alone does not prove a distributable archive exists.
const [packed] = JSON.parse(execFileSync(process.execPath, [process.env.npm_execpath, 'pack', '--json', '--ignore-scripts'], { encoding: 'utf8' }));
const files = new Set(packed.files.map(({ path }) => path));
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
assert.deepEqual(manifest.openclaw.extensions, ['./dist/index.js']);
for (const source of readdirSync('src').filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts'))) {
  for (const suffix of ['.js', '.d.ts']) assert(files.has(`dist/${source.slice(0, -3)}${suffix}`), `Missing output for ${source}`);
}
for (const path of ['package.json', 'README.md', 'VERIFICATION.md', 'openclaw.plugin.json', 'overlay/pet-overlay.swift', 'overlay/windows/Program.cs', 'overlay/windows/OpenClawPetOverlay.csproj']) assert(files.has(path), `Missing ${path}`);
const native = process.platform === 'darwin' ? 'pet-overlay-macos' : process.platform === 'win32' ? 'pet-overlay-win.exe' : undefined;
assert(native, 'Package validation requires a macOS or Windows build host');
assert(files.has(`dist/${native}`), `Missing native helper ${native}`);
if (process.platform === 'darwin') assert(packed.files.find(file => file.path === `dist/${native}`).mode & 0o111, 'Packed macOS helper is not executable');
assert(!files.has(`dist/${native === 'pet-overlay-macos' ? 'pet-overlay-win.exe' : 'pet-overlay-macos'}`), 'Archive contains a stale helper from another platform');
const binary = readFileSync(`dist/${native}`);
assert(binary.length > 1024, 'Native helper is empty or truncated');
assert(process.platform === 'win32' ? binary.subarray(0, 2).toString() === 'MZ' : ['cffaedfe', 'feedfacf', 'cafebabe'].includes(binary.subarray(0, 4).toString('hex')), 'Invalid native executable header');
for (const path of files) assert(!/(^|\/)(node_modules|pets|\.env|\.pet-runs)(\/|$)|\.test\.|\.pdb$/.test(path), `Unexpected private/development file: ${path}`);
// Exercise the actual compiled SDK entry, not a mocked replacement.
const { default: plugin } = await import('../dist/index.js');
assert.equal(plugin.id, 'openclaw-pet');
assert.equal(typeof plugin.register, 'function');
console.log(JSON.stringify({ filename: packed.filename, integrity: packed.integrity, platform: process.platform, arch: process.arch, sdk: manifest.devDependencies.openclaw, files: files.size }, null, 2));
