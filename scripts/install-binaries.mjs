#!/usr/bin/env node
/**
 * postinstall script: downloads Typst into bin/ so the project is
 * self-contained after `npm install`. No system-level install needed.
 *
 * Skipped automatically when the binary already exists or when SKIP_BIN_DOWNLOAD=1.
 */
import { createWriteStream, existsSync, mkdirSync, chmodSync, renameSync, rmSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_DIR = path.join(__dirname, "..", "bin");
const TYPST_VERSION = "0.15.1";

const PLATFORMS = {
  "linux-x64": {
    url: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz`,
    typstBin: (extracted) => path.join(extracted, "typst"),
    archiveType: "tar.xz",
  },
  "linux-arm64": {
    url: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-aarch64-unknown-linux-musl.tar.xz`,
    typstBin: (extracted) => path.join(extracted, "typst"),
    archiveType: "tar.xz",
  },
  "darwin-x64": {
    url: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-apple-darwin.tar.xz`,
    typstBin: (extracted) => path.join(extracted, "typst"),
    archiveType: "tar.xz",
  },
  "darwin-arm64": {
    url: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-aarch64-apple-darwin.tar.xz`,
    typstBin: (extracted) => path.join(extracted, "typst"),
    archiveType: "tar.xz",
  },
  "win32-x64": {
    url: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-pc-windows-msvc.zip`,
    typstBin: (extracted) => path.join(extracted, `typst-x86_64-pc-windows-msvc`, "typst.exe"),
    archiveType: "zip",
  },
};

function getPlatformKey() {
  const key = `${process.platform}-${process.arch}`;
  if (!(key in PLATFORMS)) {
    throw new Error(`Unsupported platform: ${key}. Please install Typst manually.`);
  }
  return key;
}

async function downloadFile(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  const ws = createWriteStream(dest);
  await pipeline(res.body, ws);
}

async function extractArchive(archivePath, destDir, archiveType) {
  mkdirSync(destDir, { recursive: true });
  if (archiveType === "zip") {
    if (process.platform === "win32") {
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `Expand-Archive -LiteralPath '${archivePath.replaceAll("'", "''")}' -DestinationPath '${destDir.replaceAll("'", "''")}' -Force`,
        ],
        { stdio: "inherit" },
      );
    } else {
      execFileSync("unzip", ["-q", "-o", archivePath, "-d", destDir], { stdio: "inherit" });
    }
  } else {
    execFileSync("tar", ["xf", archivePath, "-C", destDir, "--strip-components=1"], {
      stdio: "inherit",
    });
  }
}

async function installTypst() {
  const binPath = path.join(BIN_DIR, process.platform === "win32" ? "typst.exe" : "typst");
  if (existsSync(binPath)) {
    console.log("  typst: already present, skipping");
    return;
  }

  const key = getPlatformKey();
  const cfg = PLATFORMS[key];
  console.log(`Installing Typst for ${key}...`);
  console.log(`  typst: downloading from ${cfg.url}`);
  mkdirSync(BIN_DIR, { recursive: true });

  const archivePath = path.join(BIN_DIR, path.basename(new URL(cfg.url).pathname));
  await downloadFile(cfg.url, archivePath);

  const extractDir = path.join(BIN_DIR, "typst-extract");
  await extractArchive(archivePath, extractDir, cfg.archiveType);

  const extractedBin = cfg.typstBin(extractDir);
  if (!existsSync(extractedBin)) {
    throw new Error(`Binary not found at expected path after extraction: ${extractedBin}`);
  }

  renameSync(extractedBin, binPath);
  if (process.platform !== "win32") chmodSync(binPath, 0o755);

  rmSync(extractDir, { recursive: true, force: true });
  rmSync(archivePath, { force: true });
  console.log(`  typst: installed at ${path.relative(process.cwd(), binPath)}`);
}

if (process.env.SKIP_BIN_DOWNLOAD === "1") {
  console.log("Skipping binary download (SKIP_BIN_DOWNLOAD=1)");
} else {
  installTypst().catch((err) => {
    console.error("Binary installation failed:", err.message);
    console.error("You can install Typst manually and add it to your PATH.");
    process.exitCode = 0;
  });
}
