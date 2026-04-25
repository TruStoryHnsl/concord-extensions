/**
 * Shared types for player-facing per-game rules documentation.
 *
 * Each game has a `rules-doc.ts` next to its `rules.ts`. They co-locate so
 * a refactor that changes the rule logic is forced past the rules text
 * (and hopefully prompts the author to update both).
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
