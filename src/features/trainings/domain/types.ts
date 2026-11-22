/**
 * Trainings — the data, as trainings_api.state() returns it.
 *
 * Words: a category is a team's trainings (בנייה, תוכנה…) or a special
 * certification (CNC). It has columns, columns have items. A person holds an
 * item (certified), may teach it, and has a rank per category.
 */
export interface Column { id: string; he: string; label: string; header: string }

export interface Category {
  id: string
  name: string
  kind: 'team' | 'special'
  /** the NeatSystem team it belongs to (team categories) */
  team: string | null
  icon: string | null
  sort: number
  item_noun: string
  item_noun_singular: string
  favorite_label: string
  columns: Column[]
}

/** "needs all of these" / "needs at least n of these" */
export interface PrereqGroup { mode: 'all' | 'at_least'; n?: number; ids: string[] }

export interface Item {
  id: string
  category: string
  name: string
  column: string
  icon: string | null
  desc: string | null
  groups: PrereqGroup[]
  sort: number
}

export interface Cert { user: string; item: string; at: string; by: string | null; teach: boolean; teachAt: string | null; early: boolean }
export type MembershipKind = 'extra' | 'paused'
export interface MembershipRow { user: string; category: string; kind: MembershipKind; active: boolean; joinedAt?: string }
export interface Favorite { user: string; category: string; text: string }
export interface UserInCategory { user: string; category: string }
export interface Rank { id: string; name: string; color: string; min_grade: number | null; sort: number; badge: string; wordmark: string }
export interface RankRule { category: string; rank: string; items: string[]; minGrade: number | null }
export interface CurrentRank { user: string; category: string; rank: string | null; manual: boolean }

export interface TrainingsEvent {
  id: string | number
  at: string
  by: string | null
  /** who did it, for events imported from StudentTracker */
  byName?: string | null
  type: string
  user: string | null
  category: string | null
  item: string | null
  text: string | null
  early: boolean
}

/** What the signed-in person may do (from NeatSystem's permissions). */
export interface TrainingsPerms { certifyAll: boolean; editCatalog: boolean; manage: boolean }

export interface TrainingsState {
  categories: Category[]
  items: Item[]
  certs: Cert[]
  memberships: MembershipRow[]
  favorites: Favorite[]
  access: UserInCategory[]
  approvers: UserInCategory[]
  locks: UserInCategory[]
  ranks: Rank[]
  rules: RankRule[]
  current: CurrentRank[]
  events: TrainingsEvent[]
  perms: TrainingsPerms
}

export type ItemState = 'locked' | 'open' | 'held'

/** A person's relation to a category (same rules as trainings.membership() in SQL). */
export interface Membership { kind: 'team' | 'special' | 'extra' | 'paused' | 'former'; active: boolean }
