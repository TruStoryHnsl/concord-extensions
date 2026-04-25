/**
 * Shared types for player-facing per-game rules documentation.
 *
 * Each game has a rules-doc.ts next to its rules.ts. Co-located so a
 * refactor that changes rule logic also drags the rules text into the
 * diff.
 *
 * Mirrors packages/card-suite/src/games/rules-doc-types.ts.
 */

export interface RulesSection {
  readonly heading: string
  readonly body: string
}

export interface RulesDoc {
  readonly title: string
  readonly sections: readonly RulesSection[]
}

/** Total body length across all sections. Used by tests to guard against
 * accidental blanking of the rules. */
export function totalBodyLength(doc: RulesDoc): number {
  return doc.sections.reduce((acc, s) => acc + s.body.length, 0)
}
