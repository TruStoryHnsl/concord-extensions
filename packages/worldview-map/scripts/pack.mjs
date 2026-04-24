import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const DIST = resolve(ROOT, "dist");

if (!existsSync(DIST)) {
  console.error(
    "dist/ not found — run `pnpm build` (or `node scripts/build.mjs`) first",
  );
  process.exit(1);
}

const manifest = JSON.parse(
  await readFile(resolve(ROOT, "manifest.json"), "utf-8"),
);
const zipName = `${manifest.id}@${manifest.version}.zip`;
const zipPath = resolve(ROOT, zipName);
if (existsSync(zipPath)) await rm(zipPath);

// Use the host's `python3` to zip — the existing worldview package's
// pack.mjs does the same thing because `zip` isn't installed everywhere.
execFileSync(
  "python3",
  [
    "-c",
    `
import zipfile, sys
from pathlib import Path
src = Path(sys.argv[1])
zp = Path(sys.argv[2])
with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in src.rglob('*'):
        if p.is_file():
            z.write(p, p.relative_to(src))
print(zp.stat().st_size)
`,
    DIST,
    zipPath,
  ],
  { stdio: "inherit" },
);
console.log(`packed: ${zipName}`);
