// Downloads the pinned hyperfine release for a target triple and installs it as a Tauri
// sidecar (src-tauri/binaries/hyperfine-<triple>[.exe]) with its licence files.
//
//   node scripts/fetch-hyperfine.mjs [target-triple]     (default: the Rust host triple)
//
// Archives are verified against pinned SHA-256 digests. The Windows x64 digest was cross-checked
// against the winget-verified binary; the others were pinned from the first download.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "1.20.0";

const TARGETS = {
  "x86_64-pc-windows-msvc": {
    archive: "zip",
    sha256: "2508c549b049b1d4342d08edc1cb42bfac169082b6e3069431b5bab9822dbb32",
  },
  "aarch64-apple-darwin": {
    archive: "tar.gz",
    sha256: "8ee7067016620447c9d2d6234ec9a4680f958b7ad983549b56334668f63075b5",
  },
  "x86_64-apple-darwin": {
    archive: "tar.gz",
    sha256: "f58d0b90993fadfa122a351428c469ce24afef3865f027f0e6e86f0830d088f1",
  },
  "x86_64-unknown-linux-gnu": {
    archive: "tar.gz",
    sha256: "63ad53934062118f5b0be11785e0bb1603d4b91667d1921f2fd8df9a8712040a",
  },
  "aarch64-unknown-linux-gnu": {
    archive: "tar.gz",
    sha256: "90875cb1db7a1d797c311174d061728361e58fc70e3b62262a00635ac3b1997c",
  },
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const binDir = join(root, "src-tauri", "binaries");

function hostTriple() {
  const out = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  const host = /^host: (.+)$/m.exec(out)?.[1];
  if (!host) throw new Error("Could not read the host triple from `rustc -vV`.");
  return host;
}

const triple = process.argv[2] ?? hostTriple();
const spec = TARGETS[triple];
if (!spec) {
  console.error(`No pinned hyperfine build for ${triple}. Known: ${Object.keys(TARGETS).join(", ")}`);
  process.exit(1);
}

const exe = triple.includes("windows") ? ".exe" : "";
const dest = join(binDir, `hyperfine-${triple}${exe}`);
const stamp = `${dest}.version`;

if (existsSync(dest) && existsSync(stamp) && readFileSync(stamp, "utf8").trim() === `${VERSION} ${spec.sha256}`) {
  console.log(`hyperfine ${VERSION} already present for ${triple}`);
  process.exit(0);
}

const name = `hyperfine-v${VERSION}-${triple}`;
const url = `https://github.com/sharkdp/hyperfine/releases/download/v${VERSION}/${name}.${spec.archive}`;
console.log(`Downloading ${url}`);
const res = await fetch(url);
if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
const data = Buffer.from(await res.arrayBuffer());

const digest = createHash("sha256").update(data).digest("hex");
if (digest !== spec.sha256) {
  console.error(`Checksum mismatch for ${name}.${spec.archive}\n  expected ${spec.sha256}\n  actual   ${digest}`);
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), "benchlab-hyperfine-"));
try {
  const archivePath = join(tmp, `${name}.${spec.archive}`);
  writeFileSync(archivePath, data);
  // Relative names with cwd=tmp: GNU tar (e.g. from Git Bash) misreads "C:\..." as a remote host.
  const file = `${name}.${spec.archive}`;
  if (spec.archive === "zip") {
    if (process.platform === "win32") {
      execFileSync(
        "powershell",
        ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${tmp}' -Force`],
        { stdio: "inherit" },
      );
    } else {
      execFileSync("unzip", ["-q", file], { cwd: tmp });
    }
  } else {
    execFileSync("tar", ["-xzf", file], { cwd: tmp });
  }

  mkdirSync(binDir, { recursive: true });
  copyFileSync(join(tmp, name, `hyperfine${exe}`), dest);
  if (!exe) execFileSync("chmod", ["+x", dest]);

  const licenses = join(binDir, "licenses", "hyperfine");
  mkdirSync(licenses, { recursive: true });
  for (const f of ["LICENSE-APACHE", "LICENSE-MIT"]) copyFileSync(join(tmp, name, f), join(licenses, f));
  writeFileSync(stamp, `${VERSION} ${spec.sha256}\n`);
  console.log(`Installed ${dest}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
