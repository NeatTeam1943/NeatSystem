import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Person, Team } from './api'

/**
 * The tab contract — what a sub-system repo exports from
 * `neatsystem/tab.(js|jsx|ts|tsx)` so NeatSystem can show it as one of its tabs.
 *
 * A sub-system repo is added as a git submodule under systems/<folder>. At
 * build time NeatSystem finds every systems/<folder>/neatsystem/tab.* and
 * mounts its Root at /<id>/*. The person never sees a seam: same login, same
 * shell, same design kit (@neatsystem/kit).
 *
 * Tab code may import only: react, react-dom, react-router-dom, lucide-react,
 * @neatsystem/kit, and its own files. Data goes through host.supabase, into
 * the sub-system's own <sys>_api schema.
 *
 * Bump TAB_CONTRACT only for breaking changes; NeatSystem refuses a tab with
 * a different contract instead of crashing on it.
 */
export const TAB_CONTRACT = 1

export interface TabHost {
  contract: 1
  mode: 'supabase' | 'mock'
  tabId: string
  /** where this tab is mounted, e.g. "/trainings" */
  base: string
  /** the shared project's client, already signed in. null in mock mode. */
  supabase: SupabaseClient | null
  me: Person
  /** hub.people as the viewer may see them */
  people: Person[]
  teams: Team[]
  can: (perm: string) => boolean
  /** absolute app path for a path inside this tab: to('/p/1') -> '/trainings/p/1' */
  to: (path?: string) => string
  /** refresh NeatSystem's cached reads (people, profile blocks) after a write */
  invalidate: () => void
  toast: (text: string, opts?: { bad?: boolean }) => void
}

export interface TabHomeCard {
  id: string
  order: number
  column: 'main' | 'side'
  Component: ComponentType<{ host: TabHost }>
}

export interface TabExport {
  contract: number
  /** route + data key, e.g. "trainings" */
  id: string
  label: string
  icon?: LucideIcon
  /** position in the sidebar (core pages use 10..90) */
  order?: number
  /** position in the phone bottom bar (1-4) */
  dock?: number
  visible?: (h: { me: Person; can: (perm: string) => boolean }) => boolean
  Root: ComponentType<{ host: TabHost }>
  home?: TabHomeCard[]
  /**
   * Where NeatSystem reads this system's part of a profile:
   * <schema>.<fn>(p_user uuid) returns jsonb (src/core/profileBlocks.ts).
   * Read with GET = read-only transaction.
   */
  profile?: { schema: string; fn: string }
  /** mock-mode stand-ins for the SQL side (dev:mock, tests, preview) */
  mock?: {
    profile?: (user: string, ctx: MockCtx) => unknown | Promise<unknown>
    /** the same list the SQL migration passes to hub.register_permissions */
    permissions?: { key: string; label: string; grp?: string; sort?: number; roles?: string[] }[]
  }
}

/** Who is asking, for mock readers that run outside the tab (profile page, archive). */
export interface MockCtx { me: Person; people: Person[]; can: (perm: string) => boolean }

export interface LoadedTab { folder: string; tab: TabExport }
export interface TabProblem { folder: string; problem: string }

const ID = /^[a-z][a-z0-9-]{1,30}$/
const RESERVED = new Set(['people', 'inbox', 'admin', 'money', 'settings', 'archive'])

/** Validates one module export. Never throws. */
export function checkTab(folder: string, mod: unknown): LoadedTab | TabProblem {
  const t = (mod as { default?: unknown } | null)?.default as Partial<TabExport> | undefined
  if (!t || typeof t !== 'object') return { folder, problem: 'אין export default בקובץ הטאב' }
  if (t.contract !== TAB_CONTRACT) return { folder, problem: `גרסת חוזה ${String(t.contract)} — NeatSystem תומך ב-${TAB_CONTRACT}` }
  if (typeof t.id !== 'string' || !ID.test(t.id)) return { folder, problem: `מזהה לא חוקי: ${String(t.id)}` }
  if (RESERVED.has(t.id)) return { folder, problem: `המזהה ${t.id} שמור ל-NeatSystem` }
  if (typeof t.label !== 'string' || !t.label.trim()) return { folder, problem: 'חסר label' }
  if (typeof t.Root !== 'function' && typeof t.Root !== 'object') return { folder, problem: 'חסר Root' }
  if (t.profile && (typeof t.profile.schema !== 'string' || typeof t.profile.fn !== 'string')) return { folder, problem: 'profile צריך schema + fn' }
  return { folder, tab: t as TabExport }
}
export const isProblem = (x: LoadedTab | TabProblem): x is TabProblem => 'problem' in x
