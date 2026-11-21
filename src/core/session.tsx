import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { api, type Person, type SessionUser, type Team } from './api'
import { invalidate, useData } from './data'

export type SessionState =
  | { kind: 'loading' }
  | { kind: 'signed_out' }
  | { kind: 'needs_profile'; user: SessionUser; previous: Person | null } // first visit, or asked again after a rejection
  | { kind: 'pending'; user: SessionUser; me: Person }
  | { kind: 'archived'; user: SessionUser; me: Person }
  | { kind: 'active'; user: SessionUser; me: Person }

export interface Session {
  state: SessionState
  /** only meaningful when active */
  me: Person
  people: Person[]
  teams: Team[]
  perms: Set<string>
  can: (perm: string) => boolean
}

const Ctx = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  useEffect(() => api.onAuthChange(() => invalidate()), [])
  const user = useData('auth:user', () => api.currentUser())
  const uid = user.data?.id ?? null
  const people = useData(uid ? `people:${uid}` : null, () => api.people())
  const perms = useData(uid ? `perms:${uid}` : null, () => api.myPermissions())
  const teams = useData('teams', () => api.teams())

  const value = useMemo<Session>(() => {
    const permSet = new Set(perms.data ?? [])
    const base = { people: people.data ?? [], teams: teams.data ?? [], perms: permSet, can: (p: string) => permSet.has(p) }
    const loading = { ...base, state: { kind: 'loading' } as SessionState, me: null as unknown as Person }
    if (user.loading) return loading
    const u = user.data
    if (!u) return { ...base, state: { kind: 'signed_out' }, me: null as unknown as Person }
    if (people.loading || perms.loading || teams.loading) return loading
    const me = (people.data ?? []).find((p) => p.id === u.id) ?? null
    if (!me || me.status === 'rejected') return { ...base, state: { kind: 'needs_profile', user: u, previous: me }, me: null as unknown as Person }
    if (me.status === 'pending') return { ...base, state: { kind: 'pending', user: u, me }, me }
    if (me.status === 'archived') return { ...base, state: { kind: 'archived', user: u, me }, me }
    return { ...base, state: { kind: 'active', user: u, me }, me }
  }, [user.loading, user.data, people.loading, people.data, perms.loading, perms.data, teams.loading, teams.data])

  // a mentor may have added this email ahead of time: take that profile (once per login)
  const claimed = useRef<string | null>(null)
  const k = value.state.kind
  useEffect(() => {
    if ((k !== 'needs_profile' && k !== 'pending') || !uid || claimed.current === uid) return
    claimed.current = uid
    void api.claimMyProfile().then((ok) => { if (ok) invalidate() })
  }, [k, uid])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): Session {
  const s = useContext(Ctx)
  if (!s) throw new Error('useSession outside SessionProvider')
  return s
}
