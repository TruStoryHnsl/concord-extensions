<!--
Conventional commits are mandatory. Branch isolation is mandatory.
Title: <type>[scope]: <description>   e.g. feat(card-suite): add Speed bot heuristic
Branch: feat/<slug> | fix/<slug> | refactor/<slug> | chore/<slug> | docs/<slug>
-->

## Summary

<!-- One paragraph. What changed and why. Mention the affected package(s) by name. -->

## Test plan

- [ ] `pnpm -r build` passes
- [ ] `pnpm -r test` passes
- [ ] New/changed pure-logic functions have unit tests
- [ ] Manually verified in a running Concord instance (describe how)
- [ ] Manifest version bumped if behavior or schema changed
- [ ] `catalog.json` updated if `bundle_url` / `bundle_size_bytes` / version changed

## Breaking changes

<!-- "None" is a valid answer. Otherwise list them and use `feat!:` / BREAKING CHANGE footer in the commit. -->

None.

## Related issues

<!-- Closes #N, refs #M. Or "none". -->
