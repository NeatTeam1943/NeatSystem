import { describe, expect, test } from 'vitest'
import type { Person } from '@/core/api'
import { memoryNeathubRepository } from './memory'
import { DeniedError } from './repository'

const people = [
  { id: 'm', full_name: 'מנטורית', position: 'mentor', status: 'active', team: null },
  { id: 'l', full_name: 'רש"צ', position: 'team_lead', status: 'active', team: 'software' },
  { id: 'a', full_name: 'חבר', position: 'member', status: 'active', team: 'software' },
] as Person[]
const as = (id: string, perms: string[] = []) =>
  memoryNeathubRepository(() => ({ me: people.find((p) => p.id === id)!, people, can: (k) => perms.includes(k) }))

describe('NEATHUB preview repository (mirrors neathub_api)', () => {
  test('roles come from permissions', async () => {
    expect((await as('m', ['neathub.manage']).me()).role).toBe('mentor')
    expect((await as('l', ['neathub.lead']).me()).role).toBe('lead')
    expect((await as('a').me()).role).toBe('member')
  })

  test('a locked link is refused, an open one is not', async () => {
    const r = as('a')
    await expect(r.url('sw-keys')).rejects.toBeInstanceOf(DeniedError)
    await expect(r.url('sw-wpilib')).resolves.toMatch(/^https:/)
  })

  test('only mentors see who edits what', async () => {
    await expect(as('l', ['neathub.lead']).users()).rejects.toBeInstanceOf(DeniedError)
    const users = await as('m', ['neathub.manage']).users()
    expect(users.find((u) => u.uid === 'l')?.scopes).toEqual(['sw'])
  })

  test('members cannot save', async () => {
    const r = as('a')
    const [n] = await r.nodes()
    await expect(r.saveNodes([{ ...n, title: 'x' }])).rejects.toBeInstanceOf(DeniedError)
  })
})
