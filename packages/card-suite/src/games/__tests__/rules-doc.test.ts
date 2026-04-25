/**
 * Sanity tests on the per-game rules documentation. Guards against a
 * future refactor that accidentally blanks one of the rules-doc.ts files.
 */
import { describe, expect, it } from 'vitest'
import { RULES as BLACKJACK_RULES } from '../blackjack/rules-doc'
import { RULES as KP_RULES } from '../kings-and-peasants/rules-doc'
import { RULES as HOLDEM_RULES } from '../poker/rules-doc'
import { totalBodyLength } from '../rules-doc-types'
import { RULES as SOLITAIRE_RULES } from '../solitaire/rules-doc'
import { RULES as SPEED_RULES } from '../speed/rules-doc'
import { RULES as WAR_RULES } from '../war/rules-doc'

const ALL_RULES = [
  { id: 'solitaire', doc: SOLITAIRE_RULES },
  { id: 'holdem', doc: HOLDEM_RULES },
  { id: 'blackjack', doc: BLACKJACK_RULES },
  { id: 'speed', doc: SPEED_RULES },
  { id: 'kings-and-peasants', doc: KP_RULES },
  { id: 'war', doc: WAR_RULES },
] as const

describe('rules-doc — every game ships a non-empty rules document', () => {
  for (const { id, doc } of ALL_RULES) {
    it(`${id}: has a non-empty title`, () => {
      expect(doc.title).toBeTruthy()
      expect(doc.title.length).toBeGreaterThan(2)
    })
    it(`${id}: has at least one section`, () => {
      expect(doc.sections.length).toBeGreaterThan(0)
    })
    it(`${id}: every section has a heading and body`, () => {
      for (const section of doc.sections) {
        expect(section.heading).toBeTruthy()
        expect(section.body).toBeTruthy()
        expect(section.body.length).toBeGreaterThan(20)
      }
    })
    it(`${id}: total body length is ≥ 300 chars`, () => {
      const len = totalBodyLength(doc)
      expect(len).toBeGreaterThanOrEqual(300)
    })
  }
})
