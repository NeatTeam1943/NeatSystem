// Domain types shared by the Supabase and mock implementations.
// They mirror supabase/migrations/0001_hub_core.sql (view hub.people etc).

export type Position = 'member' | 'team_lead' | 'captain' | 'mentor'
export type Status = 'pending' | 'active' | 'rejected' | 'archived'
export type Role = Position | 'admin'

export interface Person {
  id: string
  full_name: string
  nickname: string | null
  team: string | null
  subteams: string[]
  position: Position | null
  is_admin: boolean
  status: Status
  grad_year: number | null
  fav_tool: string | null
  avatar_url: string | null
  requested_team: string | null
  join_note: string | null
  /** null unless you may see it (self / users.view_phone) */
  phone: string | null
  /** null unless you may see it (self / users.view_private) */
  birth_date: string | null
  /** null unless you may see it */
  email: string | null
  /** MM-DD, visible to all active members */
  birthday: string | null
  decided_by: string | null
  decided_at: string | null
  created_at: string
  /** set while archived */
  archived_at?: string | null
  /** only for users.edit_membership */
  archive_reason?: string | null
  /** added by a mentor ahead of time; hasn't signed in yet */
  invited?: boolean
}

/** One frozen record made when someone left the team (hub.archives). */
export interface ArchiveRecord {
  id: number
  user_id: string
  full_name: string
  archived_at: string
  archived_by: string | null
  archived_by_name: string | null
  reason: string | null
  /** the hub.profiles row at that moment */
  profile: Record<string, unknown>
  /** what every sub-system's profile function returned, by sub-system id */
  systems: Record<string, unknown>
  audit: unknown[]
  restored_at: string | null
}

export interface Team {
  id: string
  name: string
  kind: 'team' | 'subteam'
  sort: number
}

export interface Permission {
  key: string
  label: string
  grp: string
  module: string
  sort: number
}

export interface RolePerm { role: Role; perm: string }
export interface UserPerm { user_id: string; perm: string; granted_by: string | null; granted_at: string }

export interface AuditEntry {
  id: number
  at: string
  actor: string | null
  actor_name: string | null
  action: string
  target_type: string | null
  target_id: string | null
  details: Record<string, unknown>
}

/** What we know about the signed-in Google account, before any profile exists. */
export interface SessionUser {
  id: string
  email: string
  name: string | null
  avatar: string | null
}

export interface JoinInput {
  full_name: string
  phone: string | null
  birth_date: string | null
  grad_year: number | null
  team: string | null
  note: string | null
}

export interface DecideJoinInput {
  user: string
  approve: boolean
  team?: string | null
  position?: Position
  grad_year?: number | null
  reason?: string | null
}

export interface MyProfileInput {
  nickname: string | null
  phone: string | null
  birth_date: string | null
  fav_tool: string | null
  avatar_url?: string | null
}

/** A profile made ahead of time (hub.invite_member). */
export interface InviteInput {
  email: string
  full_name: string
  team: string | null
  position: Position
  grad_year: number | null
  phone: string | null
  subteams: string[]
}

export interface MembershipInput {
  user: string
  full_name?: string
  team?: string | null
  clear_team?: boolean
  subteams?: string[]
  position?: Position
  grad_year?: number
  is_admin?: boolean
  status?: 'active' | 'archived'
}

export interface Api {
  readonly mode: 'supabase' | 'mock'
  /**
   * The Supabase client of the shared project, handed to sub-system tabs so
   * they reuse this login. null in mock mode. Typed loosely on purpose: tabs
   * are plain JS and only call .schema(x).rpc/.from on it.
   */
  readonly client: import('@supabase/supabase-js').SupabaseClient | null
  // auth
  currentUser(): Promise<SessionUser | null>
  onAuthChange(cb: () => void): () => void
  signInWithGoogle(): Promise<void>
  signOut(): Promise<void>
  // reads
  myPermissions(): Promise<string[]>
  people(): Promise<Person[]>
  teams(): Promise<Team[]>
  permissions(): Promise<Permission[]>
  rolePermissions(): Promise<RolePerm[]>
  userPermissions(): Promise<UserPerm[]>
  audit(opts?: { limit?: number; targetId?: string }): Promise<AuditEntry[]>
  // writes (each one is a single server-side function that checks permissions + audits)
  requestJoin(input: JoinInput): Promise<void>
  decideJoin(input: DecideJoinInput): Promise<void>
  updateMyProfile(input: MyProfileInput): Promise<void>
  updateMembership(input: MembershipInput): Promise<void>
  setRolePermission(role: Role, perm: string, on: boolean): Promise<void>
  // profiles made ahead of time: claimed automatically when that email signs in
  inviteMember(input: InviteInput): Promise<string>
  updateInvite(user: string, email: string, phone: string | null, birth_date: string | null): Promise<void>
  /** an invited profile with my login's email becomes mine; true if one did */
  claimMyProfile(): Promise<boolean>
  setUserPermission(user: string, perm: string, on: boolean): Promise<void>
  // leaving the team (hub.archive_member / hub.restore_member)
  archiveMember(user: string, reason: string | null): Promise<void>
  restoreMember(user: string): Promise<void>
  archives(user?: string): Promise<ArchiveRecord[]>
}

export class ApiError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
  }
}
