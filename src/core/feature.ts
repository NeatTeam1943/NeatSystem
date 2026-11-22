import { createContext, useContext, type ComponentType, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { Session } from './session'

/**
 * A feature = one area of NeatSystem (people, trainings, NEATHUB, …). Each is
 * one object of this shape in its own folder under src/features/, listed once
 * in src/app/features.ts. The shell builds navigation, routes, the "לטיפולי"
 * inbox, search, the home screen and the profile page out of these, so adding
 * a feature never touches the shell or another feature.
 *
 * A feature's CSS (any .css file under src/features/<id>/) is scoped to its
 * own routes (see scripts/scope-css.ts), so class names can't collide.
 */
export interface Feature {
  id: string
  /** sidebar / dock entries */
  nav?: NavEntry[]
  /** routes under the shell; paths are relative to the site root, e.g. "people/:id" */
  routes?: { path: string; element: ReactNode }[]
  /** items that wait for the signed-in person (approvals etc). Called on every render of the inbox — must be a hook. */
  useInbox?: (s: Session) => InboxItem[]
  /** things the command palette can find */
  useSearch?: (s: Session) => SearchItem[]
  /** cards on the home screen */
  home?: HomeWidget[]
  /** sections on a person's profile page */
  profile?: ProfileSection[]
  /**
   * The permissions this feature checks, as its migration declares them with
   * hub.register_permissions. In Supabase the migration is what counts; the
   * preview (mock mode) takes them from here.
   */
  permissions?: PermissionDecl[]
  /** how this feature's part of an archive record (its SQL snapshot()) is shown */
  ArchiveView?: ComponentType<{ data: unknown }>
}

export interface PermissionDecl {
  key: string
  label: string
  grp: string
  sort: number
  roles: string[]
}

const FeaturesContext = createContext<readonly Feature[]>([])
export const FeaturesProvider = FeaturesContext.Provider
/** Every feature of the app (the shell and the cross-feature screens read them from here). */
export const useFeatures = () => useContext(FeaturesContext)

export interface ProfileSection {
  id: string
  order: number
  Component: ComponentType<{ person: import('./api').Person }>
  visible?: (s: Session, person: import('./api').Person) => boolean
}

export interface NavEntry {
  to: string
  label: string
  icon: LucideIcon
  /** position in the rail (desktop) */
  order: number
  /** position in the phone dock (1-4). Entries without it go under "עוד". */
  dock?: number
  /** opens another site in a new tab */
  external?: boolean
  /** custom click handler (runs inside the click, e.g. to open MoneyTeam signed in) */
  action?: (s: Session) => void
  visible?: (s: Session) => boolean
  /** small count bubble */
  useBadge?: (s: Session) => number
}

export interface InboxItem {
  id: string
  /** grouping key + chip label, e.g. "join" / "הצטרפות" */
  kind: string
  kindLabel: string
  icon: LucideIcon
  title: ReactNode
  meta: ReactNode
  at: string
  /** buttons; get a `done` callback to remove the row optimistically */
  Actions: ComponentType<{ done: () => void }>
  urgent?: boolean
}

export interface SearchItem {
  id: string
  group: string
  label: string
  sub?: string
  to: string
  icon?: LucideIcon
  keywords?: string
  action?: () => void
}

export interface HomeWidget {
  id: string
  order: number
  column: 'main' | 'side'
  Component: ComponentType
  visible?: (s: Session) => boolean
}
