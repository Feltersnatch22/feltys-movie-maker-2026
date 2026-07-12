/**
 * Downloads static FFmpeg/ffprobe and places Tauri sidecar names
 * under src-tauri/binaries/.
 *
 * - Windows / Linux: BtbN GPL static builds (full codec support)
 * - macOS: eugeneware/ffmpeg-static static binaries (arm64 + x64)
 *
 * Usage: node scripts/ci-fetch-ffmpeg.mjs
 * Env: TARGET_TRIPLE override (e.g. aarch64-apple-darwin)
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  chmodSync,
  copyFileSync,
  statSync,
} from "fs";
import { pipeline } from "stream/promises";
import { execFileSync } from "child_process";
import { createGunzip } from "zlib";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Readable } from "stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "src-tauri", "binaries");

/** Pinned static Mac builds (ffmpeg + ffprobe). */
const FFMPEG_STATIC_TAG = "b6.1.1";
const FFMPEG_STATIC_BASE = `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_STATIC_TAG}`;

function detectTriple() {
  if (process.env.TARGET_TRIPLE) return process.env.TARGET_TRIPLE;
  const { platform, arch } = process;
  if (platform === "win32") return "x86_64-pc-windows-msvc";
  if (platform === "linux") return "x86_64-unknown-linux-gnu";
  if (platform === "darwin") {
    return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  }
  throw new Error(`Unsupported platform: ${platform}/${arch}`);
}

async function download(url, dest) {
  console.log(`Downloading ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Download failed ${res.status}: ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function downloadGunzip(url, dest) {
  console.log(`Downloading+gunzip ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Download failed ${res.status}: ${url}`);
  await pipeline(Readable.fromWeb(res.body), createGunzip(), createWriteStream(dest));
}

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { stdio: "inherit", cwd });
}

function sidecarNames(triple) {
  const ext = triple.includes("windows") ? ".exe" : "";
  return {
    ffmpeg: `ffmpeg-${triple}${ext}`,
    ffprobe: `ffprobe-${triple}${ext}`,
  };
}

function assertBinary(path, label) {
  if (!existsSync(path)) throw new Error(`Missing ${label}: ${path}`);
  const size = statSync(path).size;
  // Dynamically-linked brew stubs are often < 5MB; static builds are much larger.
  if (size < 5_000_000) {
    throw new Error(
      `${label} looks too small (${(size / 1e6).toFixed(1)} MB) — expected a static build`
    );
  }
  console.log(`${label}: ${(size / 1e6).toFixed(1)} MB`);
}

async function fetchWindows(triple) {
  const zip = join(tmpdir(), "ffmpeg-win.zip");
  await download(
    "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
    zip
  );
  const extract = join(tmpdir(), "ffmpeg-win-extract");
  mkdirSync(extract, { recursive: true });
  run("powershell", [
    "-NoProfile",
    "-Command",
    `Expand-Archive -Path '${zip}' -DestinationPath '${extract}' -Force`,
  ]);
  const names = sidecarNames(triple);
  const bin = execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Get-ChildItem -Path '${extract}' -Recurse -Filter ffmpeg.exe | Select-Object -First 1 -ExpandProperty DirectoryName`,
    ],
    { encoding: "utf8" }
  ).trim();
  copyFileSync(join(bin, "ffmpeg.exe"), join(outDir, names.ffmpeg));
  copyFileSync(join(bin, "ffprobe.exe"), join(outDir, names.ffprobe));
}

async function fetchLinux(triple) {
  // BtbN GPL builds are fully static and match Windows feature set.
  const archive = join(tmpdir(), "ffmpeg-linux.tar.xz");
  await download(
    "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz",
    archive
  );
  const extract = join(tmpdir(), "ffmpeg-linux-extract");
  mkdirSync(extract, { recursive: true });
  run("tar", ["-xJf", archive, "-C", extract]);
  const names = sidecarNames(triple);
  const bin = execFileSync(
    "bash",
    ["-lc", `dirname "$(find '${extract}' -type f -name ffmpeg | head -n1)"`],
    { encoding: "utf8" }
  ).trim();
  copyFileSync(join(bin, "ffmpeg"), join(outDir, names.ffmpeg));
  copyFileSync(join(bin, "ffprobe"), join(outDir, names.ffprobe));
  chmodSync(join(outDir, names.ffmpeg), 0o755);
  chmodSync(join(outDir, names.ffprobe), 0o755);
}

async function fetchMac(triple) {
  const arch = triple.startsWith("aarch64") ? "arm64" : "x64";
  const names = sidecarNames(triple);
  const ffmpegOut = join(outDir, names.ffmpeg);
  const ffprobeOut = join(outDir, names.ffprobe);

  await downloadGunzip(`${FFMPEG_STATIC_BASE}/ffmpeg-darwin-${arch}.gz`, ffmpegOut);
  await downloadGunzip(`${FFMPEG_STATIC_BASE}/ffprobe-darwin-${arch}.gz`, ffprobeOut);
  chmodSync(ffmpegOut, 0o755);
  chmodSync(ffprobeOut, 0o755);

  // Quick sanity: binary should respond to -version
  try {
    execFileSync(ffmpegOut, ["-version"], { stdio: "pipe" });
    execFileSync(ffprobeOut, ["-version"], { stdio: "pipe" });
  } catch (e) {
    throw new Error(`Static macOS ffmpeg failed -version: ${e}`);
  }
}

mkdirSync(outDir, { recursive: true });
const triple = detectTriple();
console.log(`Preparing static FFmpeg sidecars for ${triple}`);

if (triple.includes("windows")) await fetchWindows(triple);
else if (triple.includes("linux")) await fetchLinux(triple);
else if (triple.includes("darwin")) await fetchMac(triple);
else throw new Error(`No fetcher for ${triple}`);

const names = sidecarNames(triple);
const ffmpegPath = join(outDir, names.ffmpeg);
const ffprobePath = join(outDir, names.ffprobe);
assertBinary(ffmpegPath, names.ffmpeg);
assertBinary(ffprobePath, names.ffprobe);
console.log(`Ready: ${names.ffmpeg}, ${names.ffprobe}`);
