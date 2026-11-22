import { describe, expect, test } from 'vitest'
import type { Person } from '@/core/api'
import { gradeOf } from '@/core/labels'
import { TrainingsModel } from './model'
import type { TrainingsState } from './types'

const yearEnd = new Date().getMonth() >= 8 ? new Date().getFullYear() + 1 : new Date().getFullYear()
const person = (p: Partial<Person>) => ({ status: 'active', team: null, grad_year: null, position: 'member', ...p }) as Person
const people = [
  person({ id: 'm', full_name: 'מנטורית', position: 'mentor' }),
  person({ id: 'l', full_name: 'רש"צ', position: 'team_lead', team: 'build', grad_year: yearEnd }),
  person({ id: 'a', full_name: 'חבר', team: 'build', grad_year: yearEnd + 2 }),
  person({ id: 's', full_name: 'תוכנה', team: 'software', grad_year: yearEnd + 1 }),
]
const S = {
  categories: [
    { id: 'build', name: 'בנייה', kind: 'team', team: 'build', sort: 1, columns: [{ id: 'c', he: 'א' }] },
    { id: 'cnc', name: 'CNC', kind: 'special', team: null, sort: 9, columns: [] },
  ],
  items: [
    { id: 'x', category: 'build', name: 'X', column: 'c', groups: [], sort: 0 },
    { id: 'y', category: 'build', name: 'Y', column: 'c', groups: [{ mode: 'all', n: 1, ids: ['x'] }], sort: 1 },
    { id: 'z', category: 'build', name: 'Z', column: 'c', groups: [], sort: 2 },
  ],
  certs: [{ user: 'a', item: 'x', at: '2026-10-01T00:00:00Z' }, { user: 's', item: 'z', at: '2026-10-01T00:00:00Z' }],
  memberships: [], favorites: [], access: [], approvers: [], locks: [{ user: 'l', category: 'build' }],
  ranks: [{ id: 'nit', name: 'ניט', sort: 0 }, { id: 'niter', name: 'ניטר', sort: 1 }, { id: 'nitmentor', name: 'ניטמנטור', sort: 7 }],
  rules: [{ category: 'build', rank: 'nit', items: ['x'], minGrade: null }, { category: 'build', rank: 'niter', items: ['y'], minGrade: 12 }],
  current: [{ user: 'a', category: 'build', rank: 'nit', manual: false }],
  events: [],
  perms: { certifyAll: false, editCatalog: false, manage: false },
} as unknown as TrainingsState

describe('TrainingsModel', () => {
  test('membership: team, former, mentors in every team category', () => {
    const M = new TrainingsModel(S, people, 'a')
    expect(M.membership('a', 'build')?.kind).toBe('team')
    expect(M.membership('s', 'build')?.kind).toBe('former')
    expect(M.isMember('s', 'build')).toBe(false)
    expect(M.membership('m', 'build')?.kind).toBe('team')
    expect(M.membership('m', 'cnc')).toBeNull()
    expect(M.membership('a', 'cnc')).toBeNull()
  })

  test('prerequisites, a locked lead, and a rank behind a grade gate', () => {
    const M = new TrainingsModel(S, people, 'l')
    expect(M.stateOf('a', M.item('y')!)).toBe('open')
    expect(M.stateOf('l', M.item('y')!)).toBe('locked')
    expect(M.canGrant(M.person('l'), 'build')).toBe(false)
    expect(M.earned(M.person('a')!, 'build')?.id).toBe('nit')
    const M2 = new TrainingsModel({ ...S, certs: [...S.certs, { user: 'a', item: 'y', at: '2026-10-02T00:00:00Z' }] } as TrainingsState, people, 'l')
    expect(M2.earned(M2.person('a')!, 'build')?.id).toBe('nit')
    expect(M2.next('a', 'build')?.gradeOk).toBe(false)
    expect(M.rankIn('m', 'build')?.id).toBe('nitmentor')
  })

  test('mentors are listed in team categories', () => {
    const M = new TrainingsModel(S, people, 'a')
    expect(M.membersOf('build').map((u) => u.id)).toContain('m')
  })

  test('an unknown graduation year does not block a rank', () => {
    expect(new TrainingsModel(S, people, 'a').grade(person({ id: 'q', full_name: 'q' }))).toBe(12)
    expect(gradeOf(yearEnd)).toBe(12)
  })
})
