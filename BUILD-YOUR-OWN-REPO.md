# Build Your Own Concord Extension Repository

This guide is the proof that Concord's extension distribution is **open**: anyone
can stand up a connectable extension repository using only free tools and a
static host. There is no central registry, no account, no gatekeeper. A single
base URL `B` is the entire contract.

This repo (`concord-extensions`) is the canonical reference. Everything below is
what it does — copy it.

---

## 1. What a repo actually is

A Concord extension repo is **static files served over HTTPS**. The whole
protocol (`concord-repo/v1`) is:

- One JSON index at **`B/.well-known/concord-repo.json`** (primary), with an
  identical copy at **`B/index.json`** (fallback). Both served as
  `application/json` with `Access-Control-Allow-Origin: *`.
- For each extension version, a bundle zip at any URL the index points to. The
  reference layout is `B/<ext-id>/<version>/bundle.zip`.

That's it. GitHub Pages, S3, nginx, or `python -m http.server` can all host it.
The repo is **discovery and provenance, not a privilege boundary** — every
extension runs in the same sandbox regardless of which repo it came from.

## 2. The 5-minute path

1. **Fork** this repository (or copy its `scripts/`, `schema/`, and
   `.github/workflows/publish.yml`).
2. **Drop in your extension source** — a directory containing `manifest.json`
   plus your entry HTML/JS and any assets. See
   [`examples/com.concord.hello-panel/`](examples/com.concord.hello-panel) for
   the smallest complete example.
3. **Package it** into a bundle:
   ```sh
   uv run --script scripts/package-extension examples/com.concord.hello-panel/src --out-root .
   # → ./com.concord.hello-panel/1.0.0/bundle.zip
   ```
4. **Build the index** (computes every SHA-384 hash for you):
   ```sh
   uv run --script scripts/build-index --root .
   ```
5. **Verify** before you publish:
   ```sh
   uv run --script scripts/verify-repo --root .
   ```
6. **Publish** — push to `main`; the `publish.yml` workflow rebuilds, verifies,
   and deploys to GitHub Pages.
7. **Connect** — in Concord, open Extensions → add repo → paste your Pages URL
   (e.g. `https://<you>.github.io/<repo>`). Your extensions appear.

> The tools use [`uv`](https://docs.astral.sh/uv/) so dependencies install
> automatically from each script's inline metadata — nothing to `pip install`.
> Plain `python3 scripts/<tool>` works too if you install `jsonschema` and
> `pynacl` yourself.

## 3. Index format reference

```jsonc
{
  "schema": "concord-repo/v1",        // REQUIRED literal; unknown major → client refuses
  "repo_id": "concord-extensions",    // stable slug
  "name": "Concord Extensions",
  "description": "...",
  "homepage": "https://...",
  "icon": "assets/repo-icon.png",     // absolute or repo-relative to B
  "maintainer": "you",
  "updated_at": "2026-06-10T00:00:00Z",
  "signing": {                         // OPTIONAL (Tier 2) — drives the trust badge
    "public_key": "ed25519:BASE64",
    "index_sig": "BASE64_DETACHED"
  },
  "extensions": [{
    "id": "com.example.thing",         // reverse-domain; MUST equal bundle manifest.id
    "name": "Thing",
    "icon": "extension",               // Material symbol name or URL
    "summary": "...",
    "author": "...",
    "tags": ["..."],
    "latest": "1.0.0",                 // default-install version; MUST be in versions[]
    "versions": [{                     // newest-first
      "version": "1.0.0",
      "bundle_url": "com.example.thing/1.0.0/bundle.zip",  // fed verbatim to /install
      "integrity": "sha384-BASE64",    // MANDATORY SRI over bundle.zip
      "min_concord_version": "0.1.0",
      "manifest_url": "com.example.thing/1.0.0/manifest.json",
      "permissions": ["state_events"], // DISPLAY-ONLY; the bundle manifest is authoritative
      "size_bytes": 1640,
      "released_at": "..."
    }]
  }]
}
```

The machine-checkable contract is [`schema/concord-repo.v1.schema.json`](schema/concord-repo.v1.schema.json).
`build-index` fills `integrity`, `size_bytes`, `released_at`, and `manifest_url`
automatically — **you never hand-maintain hashes.** Per-extension display
metadata (name/summary/icon/tags/author) comes from
[`repo.meta.json`](repo.meta.json); anything you omit falls back to the bundle's
own manifest.

> URLs may be **repo-relative** (as above) so the repo is portable across hosts.
> Absolute URLs are also valid.

## 4. Bundle format

A bundle is a flat `.zip` whose **root** contains:

- `manifest.json` with at least these four keys:
  - `id` — reverse-domain, must equal the index entry `id`.
  - `version` — SemVer, must equal the directory/version it's published under.
  - `entry` — the HTML/JS file the sandbox loads (e.g. `index.html`).
  - `permissions` — array of permission strings (may be empty `[]`).
- the `entry` file and any assets it references.

This is byte-for-byte what Concord's `POST /api/extensions/install` pipeline
already consumes — the repo just hands it a `bundle_url`. See
[`examples/com.concord.hello-panel/manifest.json`](examples/com.concord.hello-panel/manifest.json).

## 5. Hosting

| Host | Notes |
|------|-------|
| **GitHub Pages** | What this repo uses. Needs `.nojekyll` so `.well-known/` is served. CORS (`Access-Control-Allow-Origin: *`) is on by default. See `publish.yml`. |
| **S3 / CloudFront** | Set `Content-Type: application/json` on the index and a permissive CORS policy. |
| **nginx** | `add_header Access-Control-Allow-Origin *;` and ensure `.well-known/` isn't blocked. |
| **`python -m http.server`** | For local testing only: `cd <repo> && python3 -m http.server 8771`, then point Concord at `http://127.0.0.1:8771`. |
| **`file://`** | Concord's install pipeline accepts `file://` bundle URLs only behind a dev flag. |

The single requirement everywhere: the index is reachable at
`B/.well-known/concord-repo.json` (or `B/index.json`) with CORS enabled.

## 6. Integrity & Ed25519 signing

**Tier 1 — integrity (MANDATORY, automatic).** Every version carries a SHA-384
Subresource-Integrity string. Concord's server recomputes it after fetching the
bundle and **before unpacking**, and rejects on mismatch. A tampered mirror
cannot ship a modified bundle. `build-index` computes these; `verify-repo`
re-checks them.

**Tier 2 — signing (OPTIONAL, drives the trust badge).** Sign the index with an
Ed25519 key so Concord can show a *verified* badge instead of *unverified —
community repo*. Signing **never blocks install**; it only affects trust UI.

Generate a keypair and sign:

```sh
# 1. Make a 32-byte Ed25519 seed, base64-encoded. Keep the seed SECRET.
python3 -c 'import base64; from nacl.signing import SigningKey; \
  sk=SigningKey.generate(); \
  print("SEED:", base64.b64encode(bytes(sk)).decode()); \
  print("PUB : ed25519:"+base64.b64encode(bytes(sk.verify_key)).decode())'

# 2. Sign at build time (env var or --sign-key file):
CONCORD_REPO_SIGNING_KEY="<SEED_B64>" uv run --script scripts/build-index --root .
```

The signature is **detached over the canonical index bytes** — the index
serialised with `index_sig` blanked and all keys sorted. `verify-repo`
re-derives the same canonical form and checks it against `public_key`.

For the reference repo, the public key is bundled into the Concord client as
`VITE_EXTENSION_REPO_PUBKEY`, so the default repo is verified with no
trust-on-first-use prompt. Community repos are pinned on add.

> **Never commit the private seed.** In CI, store it as the
> `CONCORD_REPO_SIGNING_KEY` repository secret (the `publish.yml` workflow reads
> it). Locally, keep it in a file outside the repo and pass `--sign-key`.

## 7. Versioning & updates

- Versions are per-extension **SemVer, newest-first** in `versions[]`.
- `latest` is the default-install version and **must** appear in `versions[]`.
- The client installs the newest `version` whose `min_concord_version ≤` the
  running Concord, and shows an update when repo `latest` > installed.
- To publish a new version: drop `<ext-id>/<new-version>/bundle.zip`, re-run
  `build-index`, commit. Old versions stay available.

## 8. `verify-repo` + CI

`verify-repo` is the gate. It checks, and fails loudly on:

1. The index validates against the JSON Schema.
2. `index.json` is byte-identical to the `.well-known` copy.
3. Every `bundle_url` resolves and its recomputed SHA-384 matches `integrity`
   (and `size_bytes` if present).
4. Each bundle's embedded `manifest.json` `id`/`version` agree with the index.
5. If signed, the Ed25519 signature verifies against the declared public key.

`.github/workflows/publish.yml` runs `build-index` then `verify-repo` on every
push before deploying — a stale or tampered index never reaches Pages.

## 9. The sandbox contract

Extensions run in a sandboxed iframe and talk to the Concord shell **only over
`postMessage`** (`concord:<event>`). The shell never hands an extension a token.
A community-repo extension has exactly the same runtime powers as one from this
reference repo. Permissions are validated at install time against Concord's
allow-list, regardless of repo. For the full runtime contract — the shell API,
the room-session model, and the permission grammar — see Concord's extension
docs (`docs/extensions/shell-api.md`, `session-model.md`, `permissions.md`).

---

**That's the whole architecture.** A static index + integrity-hashed bundles +
an optional signature. If `verify-repo` exits `0` and your index is reachable
with CORS, Concord can connect to your repo.
