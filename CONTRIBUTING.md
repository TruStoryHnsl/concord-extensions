# Contributing to concord-extensions

This repo is the official monorepo for first-party Concord extensions. Third-party submissions are not yet accepted (no review/signing pipeline). Issue reports and PRs against existing extensions, the SDK, and the build tooling are welcome.

## Filing an issue

Use the GitHub issue forms (`.github/ISSUE_TEMPLATE/`):

- **Bug report** — something broken in an existing extension or the build pipeline.
- **Feature request** — new capability, new extension idea, or SDK addition.

Include the extension package name (e.g. `card-suite`, `worldview-map`), the version, the Concord server version, and any relevant logs. Vague reports get closed.

## Opening a pull request

### Branching

Every change goes on a feature branch. Never commit to `main`.

```
feat/<slug>          new feature
fix/<slug>           bug fix
fix/<issue>-<slug>   issue-linked fix
refactor/<slug>      restructure, no behavior change
chore/<slug>         maintenance, deps, config
docs/<slug>          docs only
```

If multiple parallel sessions might pick similar slugs, add a 4-char suffix:

```
feat/card-suite-bot-difficulty-a3f9
```

This repo runs many parallel branches at once. Branch isolation is mandatory — do not append your work onto another session's branch silently.

### Commits

Conventional Commits, mandatory:

```
<type>[scope]: <description>

[body]

[footer]
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`. Breaking changes use `feat!:` or a `BREAKING CHANGE:` footer. Scope = the package, e.g. `feat(card-suite): add Speed bot heuristic`.

### Tests

- Pure logic in `src/<module>/__tests__/*.test.ts` runs under vitest with no browser. Add tests for any state-transition or rules change.
- Don't write speculative tests in the same session that built the feature. Tests verify observed behavior; they're not affirmations of intent. (See the workspace `CLAUDE.md` for the full reasoning — written in blood after a multi-day token disaster on a one-character typo.)
- Run `pnpm -r test` before pushing.

### Build artifacts

Don't commit `dist/` or built `.zip` files unless they're a versioned release artifact in the package directory (e.g. `packages/card-suite/com.concord.card-suite@0.4.0.zip`). The release pipeline produces these on tag push.

### PR description

Use the PR template. At minimum: summary, test plan checklist, and any related issues. Mention the affected extension(s) by package name.

## Local development

```bash
git clone https://github.com/TruStoryHnsl/concord-extensions
cd concord-extensions
pnpm install
pnpm -r build
pnpm -r test
```

To dev against a live Concord instance, run `pnpm dev` inside a package and point Concord's BrowserSurface dev-URL bypass at the Vite server.

## Adding a new extension

The Phase 0 scaffold and design spec are at `docs/superpowers/specs/2026-04-17-concord-extensions-design.md`. New extensions:

1. Live under `packages/<id>/` with their own `package.json`, `manifest.json`, `tsconfig.json`, `vite.config.ts`, and a `scripts/pack.mjs`.
2. Declare supported modes (`party` / `display` / `service` / `chat` / `hybrid`) in the manifest.
3. Export pure state-transition functions in addition to UI; tests target the pure layer.
4. Register in `catalog.json` with `id`, `version`, `pricing`, `modes`, `permissions`, `bundle_url`, and `bundle_size_bytes`.

Coordinate with the maintainer before starting — first-party extensions are scope-scoped, and overlap kills momentum.

## Code of conduct

Be direct. Don't waste anyone's tokens. Marketing voice gets rewritten.
