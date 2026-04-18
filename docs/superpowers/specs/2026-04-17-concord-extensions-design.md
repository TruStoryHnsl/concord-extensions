# concord-extensions — Design Spec
*2026-04-17*

## 1. Purpose

`concord-extensions` is the official monorepo for first-party Concord extensions. It houses:

- All official extension source packages (TypeScript → static web apps)
- The future `concord-sdk` npm package (extracted here when ready to publish)
- CI/CD that builds and publishes versioned `.zip` bundles to GitHub Releases

**What this repo is not**: it is not a compile-time dependency of the Concord application. Installing or upgrading an extension never requires the Concord binary to be rebuilt or the server to be restarted.

## 2. Repo Structure

```
concord-extensions/
  packages/
    worldview/              ← migrated from concord/ext/worldview/
      manifest.json
      src/
        index.ts
      dist/                 ← built output (gitignored)
      package.json
      tsconfig.json
    <next-ext>/
      ...
  docs/
    superpowers/
      specs/
  .github/
    workflows/
      release.yml           ← builds all packages + publishes .zip bundles on tag
  pnpm-workspace.yaml
  package.json
  PLAN.md
```

## 3. Extension Anatomy

Every extension is a self-contained TypeScript project that builds to a static web app:

- **`manifest.json`** — machine-readable metadata, travels inside the release `.zip`
- **`dist/index.html`** — iframe entry point
- **`dist/index.js`** — single bundled ESM script (no external runtime deps)
- **`dist/`** optional CSS and static assets

### manifest.json schema

```json
{
  "id": "com.concord.worldview",
  "version": "0.1.0",
  "name": "Worldview",
  "description": "Shared counter reference implementation of the INS-036 session model.",
  "pricing": "free",
  "entry": "index.html",
  "permissions": ["state_events"],
  "minConcordVersion": "0.1.0"
}
```

**Pricing values**: `"free"` | `"one_time"` | `"subscription"`

### package.json scripts

| Script | Purpose |
|--------|---------|
| `dev`  | Vite dev server with HMR — point Concord's dev-URL loader at this |
| `build` | Production bundle to `dist/` |
| `pack` | Zip `dist/` + `manifest.json` → `<id>@<version>.zip` for release |

## 4. Extension Runtime Model

Extensions run as sandboxed iframes inside the Concord client. They communicate with the Concord shell exclusively via `postMessage` using the SDK protocol defined in `client/src/extensions/sdk.ts` (main concord repo).

**SDK status**: types are currently inlined per-extension (as worldview does). When Concord enters its advertising/launch phase, the SDK is extracted to `packages/concord-sdk/` in this repo and published to npm. Extensions swap inlined types for the real import at that point.

**Local dev bypass**: `BrowserSurface.tsx` enforces a `*.concord.app` allowlist in production. In development mode (env flag), arbitrary `localhost:*` URLs are permitted so extension authors can point Concord at their Vite dev server without deploying anything.

## 5. Install / Update / Auth Lifecycle

This section describes behavior in the **main concord repo** (API + client), driven by this repo's design.

### Install

```
User clicks "Install"
  → Concord API fetches manifest from marketplace index
  → validates schema + minConcordVersion
  → downloads .zip → verifies checksum
  → unpacks to data/extensions/{id}/
  → writes DB registry entry (id, version, pricing, enabled, cached_at)
  → extension served at /ext/{id}/index.html
```

### On launch (per extension)

| Pricing | Behavior |
|---------|---------|
| `free` / `one_time` | Background version check (non-blocking). If newer version found: download + swap cache. No restart. |
| `subscription` | POST auth token to `concord.app` license endpoint. Valid → serve from cache. Invalid → block launch, show "subscription inactive" UI. |

### On Concord instance startup

- Validate cache exists for every registered extension. Missing → re-download silently.
- Subscription extensions defer auth until first launch (lazy).

### Key constraint

The Concord shell never handles pricing logic. The API gate controls all install/auth decisions. The iframe URL the React client receives is always a local `/ext/{id}/` path — `BrowserSurface.tsx` requires no pricing-aware changes.

## 6. Phases

### Phase 0 — Scaffold (this repo)
- pnpm workspaces, `pnpm-workspace.yaml`, root `package.json`
- Migrate `worldview` from `concord/ext/worldview/`
- Add Vite build + `pack` script to worldview
- GitHub Actions `release.yml`: on tag `<id>@<version>`, build + publish `.zip` artifact
- `PLAN.md` tracking ongoing work

### Phase 1 — Runtime loader (main concord repo)
- DB migration: `extensions` table (id, version, pricing, enabled, cached_at, remote_url)
- API endpoints: `POST /api/extensions/install`, `DELETE /api/extensions/{id}`, `GET /api/extensions`
- File system: unpack + serve `data/extensions/{id}/` under `/ext/{id}/`
- `BrowserSurface.tsx`: dev-URL bypass (env flag), route local `/ext/{id}/` URLs

### Phase 2 — Update + auth (main concord repo)
- Background version check on extension launch for `free` / `one_time`
- `concord.app` license endpoint for `subscription` auth
- "Subscription inactive" blocking UI in the extension surface

### Phase 3 — Marketplace UI (main concord repo)
- Browse official extensions from the catalog
- Install / uninstall / enable / disable per extension
- Manual `.zip` upload for self-hosted / sideloaded extensions
- Lives inside Concord Settings (reuses unified settings shell from INS-012)

### Phase 4 — SDK extraction (this repo)
- Extract `client/src/extensions/sdk.ts` → `packages/concord-sdk/`
- Publish to npm as `@concord/sdk`
- Update worldview + all other extensions to import from SDK
- Developer documentation

### Phase 5+ — Growth
- Second official extension
- Third-party developer docs + extension submission flow
- Extension store on concord.app

## 7. Constraints

- Extensions MUST NOT require the Concord binary to be rebuilt or restarted at install time.
- Extensions MUST NOT be a Rust compile-time dependency.
- Free / one-time extensions run from the local cache after first install.
- Subscription extensions re-authorize on every launch; a failed auth blocks the surface.
- The postMessage SDK bridge is the only allowed communication channel between extension code and the Concord shell.
- No extension may access Concord internals directly (no shared module imports, no direct DB access).
