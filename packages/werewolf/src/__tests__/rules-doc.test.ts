/**
 * Rules-doc sanity. Guards against blanking the rules text.
 */
import { describe, expect, it } from 'vitest'
import { RULES, totalBodyLength } from '../rules-doc'

describe('rules-doc', () => {
  it('has a non-empty title', () => {
    expect(RULES.title).toBeTruthy()
    expect(RULES.title.length).toBeGreaterThan(2)
  })

  it('has at least 5 sections', () => {
    expect(RULES.sections.length).toBeGreaterThanOrEqual(5)
  })

  it('every section has a non-empty heading and body of length ≥ 20', () => {
    for (const section of RULES.sections) {
      expect(section.heading.length).toBeGreaterThanOrEqual(3)
      expect(section.body.length).toBeGreaterThanOrEqual(20)
    }
  })

  it('total body length is ≥ 500 chars', () => {
    expect(totalBodyLength(RULES)).toBeGreaterThanOrEqual(500)
  })

  it('mentions playing-against-bots caveat', () => {
    const hasBotsSection = RULES.sections.some(
      (s) => /bot/i.test(s.heading) || /bot/i.test(s.body),
    )
    expect(hasBotsSection).toBe(true)
  })
})
