import { makeMockApi, resetMock, setMockPersona } from '@/core/api/mockApi'

// The mock mirrors the SQL rules (the SQL itself is tested by scripts/test-db.sh).
const api = makeMockApi()
beforeEach(() => resetMock())

describe('mock rules', () => {
  it('a member cannot approve join requests', async () => {
    setMockPersona('u16')
    await expect(api.decideJoin({ user: 'u19', approve: true })).rejects.toThrow('אין הרשאה')
  })
  it('a mentor can, and the person becomes active', async () => {
    setMockPersona('u1')
    await api.decideJoin({ user: 'u19', approve: true })
    expect((await api.people()).find((p) => p.id === 'u19')?.status).toBe('active')
  })
  it('phones are hidden from regular members', async () => {
    setMockPersona('u12')
    const ppl = await api.people()
    expect(ppl.find((p) => p.id === 'u6')?.phone).toBeNull()
    expect(ppl.find((p) => p.id === 'u12')?.phone).not.toBeNull()
  })
  it('nobody can change their own position', async () => {
    setMockPersona('u3')
    await expect(api.updateMembership({ user: 'u3', position: 'mentor' })).rejects.toThrow()
  })
})
