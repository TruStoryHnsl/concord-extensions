/**
 * Blood on the Clocktower (INS-004) — entry point.
 *
 * Logic-only v1. Per-mode UI surfaces (Grimoire, map, phase banner) wait on
 * the Phase 1 shell SDK in the main concord repo. Until then index.ts only
 * registers a mount-point and re-exports the rule modules for testability.
 */

export * from './rules/types'
export * from './rules/effects'
export * from './rules/phases'
export * from './rules/votes'
export * from './rules/deaths'
export * from './rules/rng'
export * from './rules/scripts'
export * as roles from './rules/roles/trouble-brewing'

if (typeof document !== 'undefined') {
  const root = document.getElementById('botc-root')
  if (root) {
    root.textContent = 'Blood on the Clocktower extension (logic-only v0.1.0)'
  }
}
