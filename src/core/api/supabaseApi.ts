import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ApiError, type Api, type ArchiveRecord, type AuditEntry, type Person } from './types'

/**
 * NeatSystem's own Supabase project (separate from MoneyTeam's).
 * The default storage key is sb-<this project's ref>-auth-token, so it never
 * collides with MoneyTeam's session on the same origin. See modules/money/bridge.ts.
 */
const passthroughLock = async <R>(_name: string, _timeout: number, fn: () => Promise<R>) => fn()

export function makeSupabaseApi(url: string, anonKey: string): Api {
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, flowType: 'pkce', detectSessionInUrl: true, lock: passthroughLock },
  })
  const hub = () => sb.schema('hub')

  const fail = (e: { message: string; code?: string } | null): never => {
    throw new ApiError(e?.message ?? 'שגיאה לא ידועה', e?.code)
  }
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { error } = await hub().rpc(fn, args)
    if (error) fail(error)
  }

  return {
    mode: 'supabase',
    client: sb,

    async currentUser() {
      const { data } = await sb.auth.getSession()
      const u = data.session?.user
      if (!u) return null
      const m = u.user_metadata ?? {}
      return { id: u.id, email: u.email ?? '', name: m.full_name ?? m.name ?? null, avatar: m.avatar_url ?? m.picture ?? null }
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') cb()
      })
      return () => data.subscription.unsubscribe()
    },
    async signInWithGoogle() {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname },
      })
      if (error) fail(error)
    },
    async signOut() {
      await sb.auth.signOut()
    },

    async myPermissions() {
      const { data, error } = await hub().rpc('my_permissions')
      if (error) fail(error)
      return (data as string[]) ?? []
    },
    async people() {
      const { data, error } = await hub().from('people').select('*').order('full_name')
      if (error) fail(error)
      return (data ?? []) as Person[]
    },
    async teams() {
      const { data, error } = await hub().from('teams').select('*').order('sort')
      if (error) fail(error)
      return data ?? []
    },
    async permissions() {
      const { data, error } = await hub().from('permissions').select('*').order('sort')
      if (error) fail(error)
      return data ?? []
    },
    async rolePermissions() {
      const { data, error } = await hub().from('role_permissions').select('*')
      if (error) fail(error)
      return data ?? []
    },
    async userPermissions() {
      const { data, error } = await hub().from('user_permissions').select('*')
      if (error) fail(error)
      return data ?? []
    },
    async audit(opts = {}) {
      let q = hub().from('audit').select('*').order('at', { ascending: false }).limit(opts.limit ?? 100)
      if (opts.targetId) q = q.eq('target_id', opts.targetId)
      const { data, error } = await q
      if (error) fail(error)
      return (data ?? []) as AuditEntry[]
    },

    requestJoin: (i) => rpc('request_join', {
      p_full_name: i.full_name, p_phone: i.phone, p_birth_date: i.birth_date, p_grad_year: i.grad_year, p_team: i.team, p_note: i.note,
    }),
    decideJoin: (i) => rpc('decide_join', {
      p_user: i.user, p_approve: i.approve, p_team: i.team ?? null, p_position: i.position ?? 'rookie', p_grad_year: i.grad_year ?? null, p_reason: i.reason ?? null,
    }),
    updateMyProfile: (i) => rpc('update_my_profile', {
      p_nickname: i.nickname, p_phone: i.phone, p_birth_date: i.birth_date, p_fav_tool: i.fav_tool, p_avatar_url: i.avatar_url ?? null,
    }),
    updateMembership: (i) => rpc('update_membership', {
      p_user: i.user, p_full_name: i.full_name ?? null, p_team: i.team ?? null, p_clear_team: i.clear_team ?? false,
      p_subteams: i.subteams ?? null, p_position: i.position ?? null, p_grad_year: i.grad_year ?? null,
      p_is_admin: i.is_admin ?? null, p_status: i.status ?? null,
    }),
    setRolePermission: (role, perm, on) => rpc('set_role_permission', { p_role: role, p_perm: perm, p_on: on }),
    setUserPermission: (user, perm, on) => rpc('set_user_permission', { p_user: user, p_perm: perm, p_on: on }),
    archiveMember: async (user, reason) => {
      const { error } = await hub().rpc('archive_member', { p_user: user, p_reason: reason })
      if (error) fail(error)
    },
    restoreMember: (user) => rpc('restore_member', { p_user: user }),
    async archives(user) {
      let q = hub().from('archives').select('*').order('archived_at', { ascending: false })
      if (user) q = q.eq('user_id', user)
      const { data, error } = await q
      if (error) fail(error)
      return (data ?? []) as ArchiveRecord[]
    },
  }
}
