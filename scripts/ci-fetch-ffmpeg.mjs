/**
 * Downloads platform FFmpeg/ffprobe and places Tauri sidecar names
 * under src-tauri/binaries/.
 *
 * Usage: node scripts/ci-fetch-ffmpeg.mjs
 * Env: TARGET_TRIPLE override (e.g. aarch64-apple-darwin)
 */
import { createWriteStream, existsSync, mkdirSync, chmodSync, copyFileSync } from "fs";
import { pipeline } from "stream/promises";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Readable } from "stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "src-tauri", "binaries");

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
  // Find bin/ffmpeg.exe inside extracted folder
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
  // Static builds from evermeet (Intel historically). On Apple Silicon CI, prefer Homebrew.
  const names = sidecarNames(triple);
  try {
    run("brew", ["install", "ffmpeg"]);
    const prefix = execFileSync("brew", ["--prefix", "ffmpeg"], { encoding: "utf8" }).trim();
    const ffmpeg = join(prefix, "bin", "ffmpeg");
    const ffprobe = join(prefix, "bin", "ffprobe");
    if (existsSync(ffmpeg) && existsSync(ffprobe)) {
      copyFileSync(ffmpeg, join(outDir, names.ffmpeg));
      copyFileSync(ffprobe, join(outDir, names.ffprobe));
      chmodSync(join(outDir, names.ffmpeg), 0o755);
      chmodSync(join(outDir, names.ffprobe), 0o755);
      return;
    }
  } catch (e) {
    console.warn("brew ffmpeg failed, trying evermeet:", e);
  }

  const ffmpegZip = join(tmpdir(), "ffmpeg-mac.zip");
  const ffprobeZip = join(tmpdir(), "ffprobe-mac.zip");
  await download("https://evermeet.cx/ffmpeg/getrelease/zip", ffmpegZip);
  await download("https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip", ffprobeZip);
  const extract = join(tmpdir(), "ffmpeg-mac-extract");
  mkdirSync(extract, { recursive: true });
  run("unzip", ["-o", ffmpegZip, "-d", extract]);
  run("unzip", ["-o", ffprobeZip, "-d", extract]);
  copyFileSync(join(extract, "ffmpeg"), join(outDir, names.ffmpeg));
  copyFileSync(join(extract, "ffprobe"), join(outDir, names.ffprobe));
  chmodSync(join(outDir, names.ffmpeg), 0o755);
  chmodSync(join(outDir, names.ffprobe), 0o755);
}

mkdirSync(outDir, { recursive: true });
const triple = detectTriple();
console.log(`Preparing FFmpeg sidecars for ${triple}`);

if (triple.includes("windows")) await fetchWindows(triple);
else if (triple.includes("linux")) await fetchLinux(triple);
else if (triple.includes("darwin")) await fetchMac(triple);
else throw new Error(`No fetcher for ${triple}`);

const names = sidecarNames(triple);
if (!existsSync(join(outDir, names.ffmpeg)) || !existsSync(join(outDir, names.ffprobe))) {
  throw new Error("Sidecar placement failed");
}
console.log(`Ready: ${names.ffmpeg}, ${names.ffprobe}`);
