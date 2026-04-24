// Worldview-map's build is intentionally not Vite. The legacy source is
// IIFE-wrapped vanilla JS with implicit globals (window.WV.config, Cesium
// loaded from CDN), and converting it to ES modules would mean rewriting
// 3,600 LOC across 16 files — all to hand the resulting tree back to a
// bundler that just needs to copy them. We instead:
//
//   1. Copy index.html, src/, styles/, manifest.json into dist/.
//   2. Rewrite ``/proxy/<provider>/`` references in source files to the
//      runtime path the host instance exposes:
//      ``/api/ext-proxy/com.concord.worldview-map/<provider>/``.
//      That path is served by concord-api (server-side OAuth handling
//      keeps Sentinel / OpenSky client secrets off the browser).
//   3. Inject a config-loader bridge before main.js so window.WV.config
//      is populated from localStorage (per-user keys for Cesium, AISStream,
//      TomTom, Windy) before any layer code runs.
//
// The output is a static bundle: index.html + src + styles + manifest.
// Everything the host shell needs to mount the extension at /ext/<id>/.

import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = ROOT;
const DIST = resolve(ROOT, "dist");

const EXT_ID = JSON.parse(
  await readFile(resolve(ROOT, "manifest.json"), "utf-8"),
).id;

const PROXY_REWRITES = [
  // Layers reference ``/proxy/<provider>``. Rewrite to the host's
  // per-extension proxy path so the iframe doesn't need to know whether
  // it's running on concorrd.com or a sibling. Concord-api authenticates
  // the request against the installed extension list and uses operator-
  // configured credentials to talk to the upstream provider.
  {
    pattern: /'\/proxy\/(opensky|sentinel|nycdot)/g,
    replacement: (_, p) => `'/api/ext-proxy/${EXT_ID}/${p}`,
  },
  {
    pattern: /"\/proxy\/(opensky|sentinel|nycdot)/g,
    replacement: (_, p) => `"/api/ext-proxy/${EXT_ID}/${p}`,
  },
];

async function copyTree(from, to) {
  await cp(from, to, { recursive: true });
}

async function rewriteProxyUrls(filePath) {
  const original = await readFile(filePath, "utf-8");
  let next = original;
  for (const { pattern, replacement } of PROXY_REWRITES) {
    next = next.replace(pattern, replacement);
  }
  if (next !== original) {
    await writeFile(filePath, next);
  }
}

async function main() {
  if (existsSync(DIST)) await rm(DIST, { recursive: true });
  await mkdir(DIST, { recursive: true });

  await copyTree(resolve(SRC, "src"), resolve(DIST, "src"));
  await copyTree(resolve(SRC, "styles"), resolve(DIST, "styles"));
  await copyFile(resolve(SRC, "index.html"), resolve(DIST, "index.html"));
  await copyFile(
    resolve(SRC, "manifest.json"),
    resolve(DIST, "manifest.json"),
  );

  // Rewrite /proxy/ → /api/ext-proxy/<id>/ in every JS file under src/.
  // Done as a streaming step rather than at runtime so the layers' fetch
  // strings remain greppable in dist.
  const layerDir = resolve(DIST, "src", "layers");
  for (const file of await (
    await import("node:fs/promises")
  ).readdir(layerDir)) {
    if (file.endsWith(".js")) await rewriteProxyUrls(resolve(layerDir, file));
  }
  // main.js sometimes references proxy paths too (currently doesn't, but
  // covering it so a future legacy-style refactor doesn't regress).
  await rewriteProxyUrls(resolve(DIST, "src", "main.js"));

  // Inject a config bridge. The legacy index.html had ``<script src="src/config.js">``
  // pointing at a file with hardcoded operator keys; in the new world the
  // operator sets per-user keys via the extension's settings UI which
  // writes to localStorage under ``concord.ext.com.concord.worldview-map.config``.
  // The bridge reads that key, normalises the field names, and exposes
  // ``window.WV.config`` for the layer files.
  const indexPath = resolve(DIST, "index.html");
  let indexHtml = await readFile(indexPath, "utf-8");
  // Drop the legacy ``<script src="src/config.js"></script>`` if present —
  // it expects a hand-edited config.js that the new install flow doesn't
  // ship. The bridge below replaces it.
  indexHtml = indexHtml.replace(
    /<script src=["']src\/config\.js["']><\/script>\s*/g,
    "",
  );
  const bridge = `\n  <script>\n  // WV config bridge — populates window.WV.config from localStorage so\n  // the legacy IIFE layers see the same shape they used to read from a\n  // hand-edited src/config.js. Operators set keys via the extension's\n  // Settings overlay (or via Concord admin → Integrations → worldview-map\n  // for instance-wide defaults).\n  (function () {\n    var KEY = "concord.ext.com.concord.worldview-map.config";\n    var stored = {};\n    try { stored = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { stored = {}; }\n    window.WV = window.WV || {};\n    window.WV.config = {\n      CESIUM_TOKEN:           stored.cesium_token           || stored.CESIUM_TOKEN           || "",\n      AISSTREAM_KEY:          stored.aisstream_key          || stored.AISSTREAM_KEY          || "",\n      OPENSKY_CLIENT_ID:      stored.opensky_client_id      || stored.OPENSKY_CLIENT_ID      || "",\n      OPENSKY_CLIENT_SECRET:  stored.opensky_client_secret  || stored.OPENSKY_CLIENT_SECRET  || "",\n      SENTINEL_INSTANCE_ID:   stored.sentinel_instance_id   || stored.SENTINEL_INSTANCE_ID   || "",\n      SENTINEL_CLIENT_ID:     stored.sentinel_client_id     || stored.SENTINEL_CLIENT_ID     || "",\n      SENTINEL_CLIENT_SECRET: stored.sentinel_client_secret || stored.SENTINEL_CLIENT_SECRET || "",\n      TOMTOM_KEY:             stored.tomtom_key             || stored.TOMTOM_KEY             || "",\n      WINDY_KEY:              stored.windy_key              || stored.WINDY_KEY              || ""\n    };\n  }());\n  </script>\n`;
  // Inject the bridge right before main.js so it executes first.
  indexHtml = indexHtml.replace(
    /(<script src=["']src\/main\.js["'])/,
    `${bridge}  $1`,
  );
  await writeFile(indexPath, indexHtml);

  console.log(`built worldview-map → ${DIST}`);
}

await main();
