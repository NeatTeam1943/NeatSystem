/**
 * Bridge to MoneyTeam — WITHOUT changing MoneyTeam.
 *
 * NeatSystem and MoneyTeam are separate Supabase projects, so their logins are
 * separate. But both sites are served from the same origin
 * (neatteam1943.github.io), so they share localStorage. That lets this site
 * start a Google login *on MoneyTeam's behalf*:
 *
 *   1. With MoneyTeam's public URL + anon key, build an auth client that uses
 *      MoneyTeam's own storage key (sb-<ref>-auth-token).
 *   2. signInWithOAuth (PKCE) writes the code verifier under that key and gives
 *      us the Google URL. We pass login_hint = the person's email, so Google
 *      skips the account picker.
 *   3. Google redirects to MoneyTeam. MoneyTeam's existing code finds ?code= and
 *      the verifier in localStorage, and finishes the login itself.
 *
 * If a MoneyTeam session already exists, we just open MoneyTeam.
 * With that session we can also read (never write) what MoneyTeam already lets
 * this person see: their membership row and the open shopping list.
 *
 * IMPORTANT: `mt-auth` is pinned to the exact auth-js version MoneyTeam ships
 * (2.110.8 — see MoneyTeam's package-lock.json). Newer versions add an
 * `sb_flow_id` parameter to the redirect URL and store the verifier
 * differently. If MoneyTeam upgrades supabase-js, upgrade the alias with it.
 */
import { AuthClient } from 'mt-auth'

export type MoneyRole = 'mentor' | 'editor' | 'viewer' | 'student' | string
export interface ShoppingItem { id: string; name: string; status: string; quantity: number }
export interface MoneyBridge {
  readonly configured: boolean
  /** null = no MoneyTeam session in this browser yet */
  role(): Promise<{ connected: boolean; role: MoneyRole | null }>
  openShopping(): Promise<ShoppingItem[]>
  /** Call synchronously from a click (keeps popup blockers happy). */
  open(path: string, email: string): void
}

export const OPEN_STATUSES = ['waiting_finance', 'pending_approval', 'waiting_sponsor', 'approved'] as const
export const SHOPPING_STATUS_HE: Record<string, string> = {
  waiting_finance: 'ממתין למוביל פיננסי', pending_approval: 'ממתין לאישור מנטור', waiting_sponsor: 'ממתין לספונסר', approved: 'מאושר',
}
export const ROLE_HE: Record<string, string> = { mentor: 'מנטור/ית', editor: 'עורך/ת', viewer: 'צפייה', student: 'תלמיד/ה' }

const passthroughLock = async <R>(_n: string, _t: number, fn: () => Promise<R>) => fn()

/** The key supabase-js uses by default — must match MoneyTeam's client exactly. */
export const moneyStorageKey = (supabaseUrl: string) => `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`

export function makeMoneyBridge(appUrl: string, sbUrl: string | undefined, anonKey: string | undefined): MoneyBridge {
  if (!sbUrl || !anonKey) {
    return {
      configured: false,
      role: async () => ({ connected: false, role: null }),
      openShopping: async () => [],
      open: (path) => { window.open(appUrl + path, '_blank', 'noopener') },
    }
  }
  const auth = new AuthClient({
    url: `${sbUrl.replace(/\/$/, '')}/auth/v1`,
    headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey },
    storageKey: moneyStorageKey(sbUrl),
    persistSession: true,
    // MoneyTeam's own tabs refresh the token; we only read it, so two clients never race to rotate it.
    autoRefreshToken: false,
    detectSessionInUrl: false,
    flowType: 'pkce',
    lock: passthroughLock,
  })
  const session = async () => {
    const { data } = await auth.getSession()
    const s = data.session
    return s && s.expires_at && s.expires_at * 1000 > Date.now() + 30_000 ? s : null
  }
  const rest = async <T>(query: string, token: string): Promise<T> => {
    const r = await fetch(`${sbUrl.replace(/\/$/, '')}/rest/v1/${query}`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } })
    if (!r.ok) throw new Error(`MoneyTeam ${r.status}`)
    return r.json() as Promise<T>
  }

  return {
    configured: true,
    async role() {
      const s = await session()
      if (!s) return { connected: false, role: null }
      try {
        const rows = await rest<{ role: string }[]>(`members?select=role&id=eq.${s.user.id}`, s.access_token)
        return { connected: true, role: rows[0]?.role ?? null }
      } catch {
        return { connected: true, role: null }
      }
    },
    async openShopping() {
      const s = await session()
      if (!s) return []
      try {
        return await rest<ShoppingItem[]>(
          `shopping_items?select=id,name,status,quantity,seasons!inner(is_active)&seasons.is_active=eq.true&status=in.(${OPEN_STATUSES.join(',')})&order=created_at.desc&limit=50`,
          s.access_token,
        )
      } catch {
        return []
      }
    },
    open(path, email) {
      // Open the tab now (inside the click), point it at the right place after the async work.
      const w = window.open('', '_blank')
      if (w) w.opener = null
      const go = (url: string) => { if (w) w.location.href = url; else window.location.href = url }
      void (async () => {
        if (await session()) return go(appUrl + path)
        const { data, error } = await auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: appUrl, skipBrowserRedirect: true, queryParams: { login_hint: email } },
        })
        go(error || !data?.url ? appUrl + path : data.url)
      })()
    },
  }
}
