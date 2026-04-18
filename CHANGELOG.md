# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-04-17

### Added
- pnpm workspaces monorepo scaffold
- `worldview` extension — Phase 0 migration from concord core
  - Pure logic functions with full test coverage (27 tests)
  - Runtime iframe + postMessage SDK integration
  - GitHub Actions release pipeline (`concord-ext-worldview@*` tags)
  - `.zip` bundle packaging via `pnpm run bundle`
