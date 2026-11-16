import { currentGradYears, gradeOf } from '@/core/labels'
import { auditText } from '@/core/auditText'

describe('gradeOf (Israeli school year starts in September)', () => {
  it('class of 2027 is in 12th grade in November 2026', () => {
    expect(gradeOf(2027, new Date('2026-11-16'))).toBe(12)
  })
  it('switches on September 1st, not January', () => {
    expect(gradeOf(2027, new Date('2026-08-31'))).toBe(11)
    expect(gradeOf(2027, new Date('2026-09-01'))).toBe(12)
  })
  it('graduates and unknown are null', () => {
    expect(gradeOf(2026, new Date('2026-11-16'))).toBeNull()
    expect(gradeOf(null)).toBeNull()
  })
  it('lists grades 12..7 youngest last', () => {
    const y = currentGradYears(new Date('2026-11-16'))
    expect(y[0]).toEqual({ year: 2027, grade: 12 })
    expect(y.at(-1)).toEqual({ year: 2032, grade: 7 })
  })
})

describe('auditText', () => {
  const teams = [{ id: 'build', name: 'בנייה', kind: 'team' as const, sort: 1 }, { id: 'cad', name: 'שרטוט', kind: 'team' as const, sort: 2 }]
  it('writes membership changes in Hebrew, old ← new', () => {
    const t = auditText({ id: 1, at: '', actor: 'a', actor_name: 'דנה', action: 'user.membership_changed', target_type: 'user', target_id: 'x', details: { team: ['build', 'cad'], position: ['rookie', 'member'] } }, [], teams)
    expect(t.what).toBe('שינה/תה פרטי חברות')
    expect(t.details).toBe('צוות: בנייה ← שרטוט · תפקיד: רוקי ← חבר/ת צוות')
  })
})
