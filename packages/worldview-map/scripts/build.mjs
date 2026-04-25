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
  //
  // CRITICAL: the bridge must run BEFORE any layer file (and before
  // src/main.js) — every layer is an IIFE that reads ``WV.config.<key>``
  // at module load time, so if WV.config is undefined when the layer
  // script first parses, the whole layer crashes with "WV is not
  // defined" and never registers its draw entrypoints. The first
  // attempt put the bridge right before main.js, AFTER the layers.
  // Result: empty globe (Cesium token never assigned, layers all
  // dead). Now the bridge replaces the original ``src/config.js``
  // <script> tag in-place — same load position the legacy app used,
  // which is before every layer file. Also fetches operator-managed
  // browser-safe keys from the host's
  // ``/api/extensions/<id>/public-config`` endpoint synchronously (XHR)
  // when localStorage is empty, so users don't have to paste tokens
  // the operator already configured.
  const indexPath = resolve(DIST, "index.html");
  let indexHtml = await readFile(indexPath, "utf-8");
  const EXT_ID_FOR_FETCH = EXT_ID;
  const bridge = [
    "<script>",
    "// WV config bridge — populates window.WV.config from localStorage,",
    "// falling back to operator-managed browser-direct keys served by the",
    "// host instance. Runs at the same load position the legacy app's",
    "// src/config.js used to (BEFORE layer files), so every layer's",
    "// IIFE that reads WV.config.* at parse time sees a populated object.",
    "(function () {",
    '  var KEY = "concord.ext.' + EXT_ID_FOR_FETCH + '.config";',
    "  var stored = {};",
    '  try { stored = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { stored = {}; }',
    "  // Synchronous XHR to /api/extensions/<id>/public-config when",
    "  // localStorage doesn't have a token yet. Synchronous because the",
    "  // bridge MUST finish populating window.WV.config before the next",
    '  // <script> tag (a layer file) starts executing — async fetch would',
    "  // mean the layers parse against an undefined WV.config. The",
    "  // endpoint is small (a single JSON object) and only fired once on",
    "  // first cold launch, so the brief blocking call is acceptable.",
    "  var hasAny = stored && (stored.cesium_token || stored.CESIUM_TOKEN);",
    "  if (!hasAny) {",
    "    try {",
    "      var xhr = new XMLHttpRequest();",
    '      xhr.open("GET", "/api/extensions/' + EXT_ID_FOR_FETCH + '/public-config", false);',
    "      xhr.send(null);",
    "      if (xhr.status === 200) {",
    "        var pubd = JSON.parse(xhr.responseText || \"{}\").config || {};",
    "        // Only fill fields the user hasn't overridden locally.",
    "        Object.keys(pubd).forEach(function (k) {",
    "          if (!stored[k]) stored[k] = pubd[k];",
    "        });",
    "        // Persist so subsequent loads skip the fetch.",
    '        try { localStorage.setItem(KEY, JSON.stringify(stored)); } catch (e) {}',
    "      }",
    "    } catch (e) {",
    '      console.warn("worldview-map: public-config fetch failed", e);',
    "    }",
    "  }",
    "  window.WV = window.WV || {};",
    "  window.WV.config = {",
    '    CESIUM_TOKEN:           stored.cesium_token           || stored.CESIUM_TOKEN           || "",',
    '    AISSTREAM_KEY:          stored.aisstream_key          || stored.AISSTREAM_KEY          || "",',
    '    OPENSKY_CLIENT_ID:      stored.opensky_client_id      || stored.OPENSKY_CLIENT_ID      || "",',
    '    OPENSKY_CLIENT_SECRET:  stored.opensky_client_secret  || stored.OPENSKY_CLIENT_SECRET  || "",',
    '    SENTINEL_INSTANCE_ID:   stored.sentinel_instance_id   || stored.SENTINEL_INSTANCE_ID   || "",',
    '    SENTINEL_CLIENT_ID:     stored.sentinel_client_id     || stored.SENTINEL_CLIENT_ID     || "",',
    '    SENTINEL_CLIENT_SECRET: stored.sentinel_client_secret || stored.SENTINEL_CLIENT_SECRET || "",',
    '    TOMTOM_KEY:             stored.tomtom_key             || stored.TOMTOM_KEY             || "",',
    '    WINDY_KEY:              stored.windy_key              || stored.WINDY_KEY              || ""',
    "  };",
    "}());",
    "</script>",
  ].join("\n");

  // Replace the legacy <script src="src/config.js"></script> with the
  // bridge AT THAT EXACT POSITION. The legacy script load order was:
  //   Cesium → satellite → config → presets → controls → layers → main.
  // Putting the bridge where config.js was preserves the invariant that
  // WV.config is populated before any layer or main.js parses.
  if (indexHtml.match(/<script src=["']src\/config\.js["']><\/script>/)) {
    indexHtml = indexHtml.replace(
      /<script src=["']src\/config\.js["']><\/script>/,
      bridge,
    );
  } else {
    // Fallback for builds where the line was already stripped: inject
    // before the first non-CDN <script src="src/...">. Catches the new
    // index.html in this repo where the line was hand-removed.
    indexHtml = indexHtml.replace(
      /(<script src=["']src\/(?!main\.js))/,
      bridge + "\n  $1",
    );
  }
  await writeFile(indexPath, indexHtml);

  console.log(`built worldview-map → ${DIST}`);
}

await main();
