import type { ComponentType, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { Session } from './session'

/**
 * The module contract. Every sub-system (people, admin, NeatHub links, later
 * Sunday, trainings, meetings...) is one object of this shape, listed once in
 * src/app/modules.ts. The shell builds navigation, routes, the "לטיפולי" inbox,
 * search and the home screen out of these — no other file needs to change
 * when a module is added.
 */
export interface HubModule {
  id: string
  /** sidebar / dock entries */
  nav?: NavEntry[]
  /** routes under the shell; paths are relative to the site root, e.g. "people/:id" */
  routes?: { path: string; element: ReactNode }[]
  /** items that wait for the signed-in person (approvals etc). Called on every render of the inbox host — must be a hook. */
  useInbox?: (s: Session) => InboxItem[]
  /** things the command palette can find */
  useSearch?: (s: Session) => SearchItem[]
  /** cards on the home screen */
  home?: HomeWidget[]
  /** sections on a person's profile page (e.g. certifications, later) */
  profile?: ProfileSection[]
}

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
