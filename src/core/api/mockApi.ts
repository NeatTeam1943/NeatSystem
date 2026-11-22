/**
 * In-memory backend for the clickable preview and for UI tests.
 * It mirrors the rules in supabase/migrations/0001_hub_core.sql closely enough
 * to demo them; the SQL (and its tests) is the source of truth.
 * All names are invented.
 */
import { ApiError, type Api, type ArchiveRecord, type AuditEntry, type Person, type Position, type Role, type RolePerm, type Team, type Permission, type UserPerm } from './types'

type Row = Omit<Person, 'birthday'> & { email: string }

const TEAMS: Team[] = [
  { id: 'cad', name: 'שרטוט', kind: 'team', sort: 1 },
  { id: 'build', name: 'בנייה', kind: 'team', sort: 2 },
  { id: 'software', name: 'תוכנה', kind: 'team', sort: 3 },
  { id: 'media', name: 'מדיה', kind: 'subteam', sort: 10 },
  { id: 'finance', name: 'פיננסי', kind: 'subteam', sort: 11 },
  { id: 'community', name: 'קהילה והתנדבויות', kind: 'subteam', sort: 12 },
  { id: 'awards', name: 'פרסים ושופטים', kind: 'subteam', sort: 13 },
]

const PERMS: Permission[] = [
  ['users.approve', 'אישור בקשות הצטרפות'],
  ['users.edit_membership', 'עריכת צוות, תפקיד ושנתון'],
  ['users.view_phone', 'צפייה בטלפונים'],
  ['users.view_private', 'צפייה בתאריך לידה ובמייל'],
  ['users.grant_permissions', 'מתן הרשאות ושינוי הטבלה'],
  ['audit.view', 'צפייה ביומן הפעולות'],
].map(([key, label], i) => ({ key, label, grp: 'משתמשים', module: 'core', sort: i + 1 }))

const ROLE_PERMS: RolePerm[] = [
  ['mentor', 'users.approve'], ['admin', 'users.approve'],
  ['mentor', 'users.edit_membership'], ['admin', 'users.edit_membership'],
  ['team_lead', 'users.view_phone'], ['captain', 'users.view_phone'], ['mentor', 'users.view_phone'], ['admin', 'users.view_phone'],
  ['mentor', 'users.view_private'], ['admin', 'users.view_private'],
  ['mentor', 'users.grant_permissions'],
  ['mentor', 'audit.view'], ['admin', 'audit.view'],
].map(([role, perm]) => ({ role: role as Role, perm }))

let seq = 0
const P = (id: string, full_name: string, o: Partial<Row>): Row => ({
  id, full_name, nickname: null, team: null, subteams: [], position: 'member', is_admin: false, status: 'active',
  grad_year: 2027, fav_tool: null, avatar_url: null, requested_team: null, join_note: null,
  phone: `050-${String(1000000 + ++seq * 7919).slice(0, 7)}`, birth_date: '2009-01-15', email: `${id}@example.com`,
  decided_by: 'u1', decided_at: '2026-09-01T10:00:00Z', created_at: '2026-09-01T09:00:00Z', ...o,
})

function seed(): Row[] {
  seq = 0
  return [
    P('u1', 'דנה לוי', { position: 'mentor', is_admin: true, grad_year: null, birth_date: '1986-04-12', fav_tool: 'מחרטה', decided_by: null }),
    P('u2', 'אבי כהן', { position: 'mentor', grad_year: null, birth_date: '1979-07-09' }),
    P('u3', 'נועה ברק', { position: 'captain', is_admin: true, team: 'software', subteams: ['awards'], grad_year: 2027, birth_date: '2008-11-16', nickname: 'נוני' }),
    P('u4', 'יואב שגיא', { position: 'captain', team: 'build', grad_year: 2027, birth_date: '2008-02-20' }),
    P('u5', 'מאיה אזולאי', { position: 'team_lead', team: 'software', grad_year: 2027, birth_date: '2008-06-01' }),
    P('u6', 'איתי פרץ', { position: 'team_lead', team: 'build', grad_year: 2027, birth_date: '2008-12-02', fav_tool: 'ZK', nickname: 'ZK' }),
    P('u7', 'שירה גולן', { position: 'team_lead', team: 'cad', subteams: ['media'], grad_year: 2028, birth_date: '2009-03-30' }),
    P('u8', 'עומר דהן', { team: 'build', grad_year: 2028, birth_date: '2009-11-17' }),
    P('u9', 'ליאור חדד', { team: 'build', grad_year: 2028, birth_date: '2010-11-16', subteams: ['community'] }),
    P('u10', 'תמר אוחיון', { team: 'cad', grad_year: 2028, birth_date: '2009-08-08' }),
    P('u11', 'רוני ביטון', { team: 'software', grad_year: 2028, birth_date: '2009-05-05', subteams: ['finance'] }),
    P('u12', 'גל מזרחי', { team: 'software', grad_year: 2029, birth_date: '2010-01-21' }),
    P('u13', 'אורי ברק', { team: 'cad', grad_year: 2029, birth_date: '2010-10-10' }),
    P('u14', 'הילה שמש', { team: 'software', grad_year: 2028, birth_date: '2009-09-19', subteams: ['media'] }),
    P('u15', 'יונתן רוזן', { position: 'member', team: 'build', grad_year: 2027, birth_date: '2008-07-07', status: 'archived', archived_at: '2026-11-14T19:02:00Z', archive_reason: 'סיים י״ב' }),
    P('u16', 'נדב שלום', { position: 'member', team: 'build', grad_year: 2030, birth_date: '2011-04-04' }),
    P('u17', 'עדי פרידמן', { position: 'member', team: 'software', grad_year: 2030, birth_date: '2011-02-14' }),
    P('u18', 'בר אלון', { position: 'member', team: 'cad', grad_year: 2030, birth_date: '2011-06-06' }),
    P('u21', 'עמית ברגר', { position: 'member', team: 'build', grad_year: 2030, birth_date: null, phone: null, invited: true, email: 'amit.berger@example.com' }),
    P('u19', 'דניאל קורן', { position: null, status: 'pending', requested_team: 'build', grad_year: 2030, birth_date: '2011-03-03', join_note: 'אחי היה בקבוצה, אני רוצה לבנות!', decided_by: null, decided_at: null, created_at: '2026-11-16T07:30:00Z' }),
    P('u20', 'רותם אלון', { position: null, status: 'pending', requested_team: 'software', grad_year: 2030, birth_date: '2011-09-09', join_note: null, decided_by: null, decided_at: null, created_at: '2026-11-15T18:10:00Z' }),
  ]
}

/** Personas for the preview's "view as" switcher. 'out' = signed out, 'new' = Google account with no profile yet. */
export const PERSONAS: { id: string; label: string }[] = [
  { id: 'u1', label: 'מנטורית + אדמין — דנה' },
  { id: 'u3', label: 'קפטנית + אדמין — נועה' },
  { id: 'u6', label: 'רש"צ בנייה — איתי' },
  { id: 'u12', label: 'חבר צוות תוכנה — גל' },
  { id: 'u16', label: 'חבר צוות בנייה — נדב' },
  { id: 'u19', label: 'ממתין לאישור — דניאל' },
  { id: 'new', label: 'נכנס בפעם הראשונה' },
  { id: 'out', label: 'לא מחובר' },
]

const store = (() => {
  const key = 'neatsystem.mock.v3'
  const fresh = () => ({
    rows: seed(), rolePerms: [...ROLE_PERMS], userPerms: [] as UserPerm[], audit: [] as AuditEntry[], archives: [] as ArchiveRecord[],
    me: 'u1' as string, newUser: null as null | { id: string; email: string; name: string },
  })
  let s = fresh()
  try { const raw = sessionStorage.getItem(key); if (raw) s = { ...s, ...JSON.parse(raw) } } catch { /* storage may be blocked */ }
  return {
    get: () => s,
    save: () => { try { sessionStorage.setItem(key, JSON.stringify(s)) } catch { /* ignore */ } },
    reset: () => { s = fresh(); try { sessionStorage.removeItem(key) } catch { /* ignore */ } },
  }
})()

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((f) => f())
const wait = () => new Promise((r) => setTimeout(r, 120))
const err = (msg: string, code = '42501') => { throw new ApiError(msg, code) }

export function setMockPersona(id: string) {
  const s = store.get()
  s.me = id
  if (id === 'new') s.newUser = { id: 'u-new', email: 'new.student@gmail.com', name: 'סתיו חדשה' }
  store.save()
  emit()
}
export function getMockPersona() { return store.get().me }
export function resetMock() { store.reset(); emit() }

function meId(): string | null {
  const s = store.get()
  if (s.me === 'out') return null
  if (s.me === 'new') return 'u-new'
  return s.me
}
const row = (id: string | null) => store.get().rows.find((r) => r.id === id)

function has(perm: string, uid = meId()): boolean {
  const p = row(uid)
  if (!p || p.status !== 'active' || !p.position) return false
  const s = store.get()
  return s.rolePerms.some((rp) => rp.perm === perm && (rp.role === p.position || (p.is_admin && rp.role === 'admin')))
    || s.userPerms.some((up) => up.user_id === p.id && up.perm === perm)
}
function audit(action: string, target_type: string | null, target_id: string | null, details: Record<string, unknown> = {}) {
  const s = store.get()
  s.audit.unshift({ id: s.audit.length + 1, at: new Date().toISOString(), actor: meId(), actor_name: row(meId())?.full_name ?? null, action, target_type, target_id, details })
}
function visible(r: Row): Person | null {
  const me = meId(); const self = r.id === me
  const active = row(me)?.status === 'active'
  const ok = self || (active && r.status === 'active')
    || ((r.status === 'pending' || r.status === 'rejected') && (has('users.approve') || has('users.edit_membership')))
    || (r.status === 'archived' && has('users.edit_membership'))
  if (!ok) return null
  return {
    ...r,
    join_note: self || has('users.approve') ? r.join_note : null,
    phone: self || has('users.view_phone') ? r.phone : null,
    birth_date: self || has('users.view_private') ? r.birth_date : null,
    email: self || has('users.view_private') || has('users.approve') || (r.invited && has('users.edit_membership')) ? r.email : null,
    invited: !!r.invited,
    birthday: r.birth_date ? r.birth_date.slice(5) : null,
  }
}
const commit = () => { store.save(); emit() }

/**
 * Preview stand-in for hub.register_permissions: a feature's declared
 * permissions (the same list its migration registers) join the table.
 */
export function registerMockPermissions(module: string, perms: { key: string; label: string; grp?: string; sort?: number; roles?: string[] }[]) {
  const s = store.get()
  for (const p of perms) {
    if (!p.key.startsWith(`${module}.`) || PERMS.some((x) => x.key === p.key)) continue
    PERMS.push({ key: p.key, label: p.label, grp: p.grp ?? module, module, sort: p.sort ?? 0 })
    for (const r of p.roles ?? []) if (!s.rolePerms.some((x) => x.role === r && x.perm === p.key)) s.rolePerms.push({ role: r as Role, perm: p.key })
  }
}

/** Preview stand-in for a feature's snapshot() hook (hub.features): what the archive keeps. */
const snapshotReaders = new Map<string, (user: string) => unknown>()
export function registerMockSnapshot(feature: string, read: (user: string) => unknown) { snapshotReaders.set(feature, read) }

async function archive(user: string, reason: string | null) {
  if (!has('users.edit_membership')) err('אין הרשאה: users.edit_membership')
  if (user === meId()) err('אי אפשר להעביר את עצמך לארכיון')
  const r = row(user)
  if (!r || r.status !== 'active') err('אפשר להעביר לארכיון רק חבר/ה פעיל/ה', 'P0002')
  if ((r!.position === 'mentor' || r!.is_admin) && !has('users.grant_permissions')) err('אין הרשאה: users.grant_permissions')
  const systems: Record<string, unknown> = {}
  for (const [id, read] of snapshotReaders) {
    try { systems[id] = await read(user) } catch (e) { systems[id] = { error: 'P0001', detail: (e as Error).message } }
  }
  const s = store.get()
  const at = new Date().toISOString()
  const rec: ArchiveRecord = {
    id: s.archives.length + 1, user_id: user, full_name: r!.full_name, archived_at: at, archived_by: meId(),
    archived_by_name: row(meId())?.full_name ?? null, reason: reason?.trim() || null,
    profile: { ...r! }, systems, audit: s.audit.filter((a) => a.target_id === user), restored_at: null,
  }
  s.archives.unshift(rec)
  Object.assign(r!, { status: 'archived', archived_at: at, archive_reason: rec.reason })
  audit('user.archived', 'user', user, { reason: rec.reason, archive: rec.id })
}
function restore(user: string) {
  if (!has('users.edit_membership')) err('אין הרשאה: users.edit_membership')
  const r = row(user)
  if (!r || r.status !== 'archived') err('המשתמש לא בארכיון', 'P0002')
  if ((r!.position === 'mentor' || r!.is_admin) && !has('users.grant_permissions')) err('אין הרשאה: users.grant_permissions')
  Object.assign(r!, { status: 'active', archived_at: null, archive_reason: null })
  const rec = store.get().archives.find((a) => a.user_id === user && !a.restored_at)
  if (rec) rec.restored_at = new Date().toISOString()
  audit('user.restored', 'user', user, {})
}
const phoneOk = (p: string | null) => !p || /^[0-9+\- ]{7,20}$/.test(p)

export function makeMockApi(): Api {
  return {
    mode: 'mock',
    client: null,
    async currentUser() {
      const s = store.get(); const id = meId()
      if (!id) return null
      if (id === 'u-new') return { id, email: s.newUser?.email ?? '', name: s.newUser?.name ?? null, avatar: null }
      const r = row(id)!
      return { id, email: r.email, name: r.full_name, avatar: null }
    },
    onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb) },
    async signInWithGoogle() { setMockPersona('u1') },
    async signOut() { setMockPersona('out') },

    async myPermissions() { await wait(); return PERMS.map((p) => p.key).filter((k) => has(k)) },
    async people() { await wait(); return store.get().rows.map(visible).filter((x): x is Person => !!x).sort((a, b) => a.full_name.localeCompare(b.full_name, 'he')) },
    async teams() { return TEAMS },
    async permissions() { return row(meId())?.status === 'active' ? PERMS : [] },
    async rolePermissions() { return row(meId())?.status === 'active' ? [...store.get().rolePerms] : [] },
    async userPermissions() {
      const me = meId()
      return store.get().userPerms.filter((u) => u.user_id === me || has('users.grant_permissions') || has('users.edit_membership'))
    },
    async audit(opts = {}) {
      await wait()
      if (!has('audit.view')) return []
      return store.get().audit.filter((a) => !opts.targetId || a.target_id === opts.targetId).slice(0, opts.limit ?? 100)
    },

    async requestJoin(i) {
      await wait()
      const id = meId(); if (!id) err('צריך להתחבר', '28000')
      const s = store.get(); const cur = row(id)
      if (cur && (cur.status === 'active' || cur.status === 'archived')) err('כבר יש לך חשבון פעיל', '23505')
      if (!phoneOk(i.phone)) err('מספר טלפון לא תקין', '23514')
      const base = P(id!, i.full_name.trim(), {
        position: null, status: 'pending', team: null, phone: i.phone, birth_date: i.birth_date, grad_year: i.grad_year,
        requested_team: i.team, join_note: i.note, email: s.newUser?.email ?? `${id}@example.com`, decided_by: null, decided_at: null,
        created_at: new Date().toISOString(),
      })
      s.rows = [...s.rows.filter((r) => r.id !== id), base]
      if (s.me === 'new') s.me = 'u-new'
      audit('user.join_requested', 'user', id, { team: i.team, again: !!cur })
      commit()
    },
    async decideJoin(i) {
      await wait()
      if (!has('users.approve')) err('אין הרשאה: users.approve')
      const r = row(i.user)
      if (!r || r.status !== 'pending') err('הבקשה כבר טופלה או לא קיימת', 'P0002')
      if (i.approve) {
        const pos: Position = i.position ?? 'member'
        if (pos !== 'member' && !has('users.edit_membership')) err('אין הרשאה לקבוע תפקיד')
        if (pos === 'mentor' && !has('users.grant_permissions')) err('רק מי שמחלק הרשאות יכול לצרף מנטור')
        Object.assign(r!, { status: 'active', team: i.team ?? r!.requested_team, position: pos, grad_year: i.grad_year ?? r!.grad_year, decided_by: meId(), decided_at: new Date().toISOString() })
        audit('user.approved', 'user', i.user, { team: r!.team, position: pos })
      } else {
        Object.assign(r!, { status: 'rejected', decided_by: meId(), decided_at: new Date().toISOString() })
        audit('user.rejected', 'user', i.user, { reason: i.reason ?? null })
      }
      commit()
    },
    async updateMyProfile(i) {
      await wait()
      const r = row(meId())
      if (!r || r.status !== 'active') err('אין פרופיל פעיל', 'P0002')
      if (!phoneOk(i.phone)) err('מספר טלפון לא תקין', '23514')
      const fields = (['nickname', 'phone', 'birth_date', 'fav_tool'] as const).filter((f) => (r as Row)[f] !== (i[f] || null))
      Object.assign(r!, { nickname: i.nickname || null, phone: i.phone || null, birth_date: i.birth_date || null, fav_tool: i.fav_tool || null })
      audit('user.profile_edited', 'user', r!.id, { fields })
      commit()
    },
    async updateMembership(i) {
      await wait()
      if (!has('users.edit_membership')) err('אין הרשאה: users.edit_membership')
      if (i.user === meId() && (i.position || i.is_admin !== undefined || i.status)) err('אי אפשר לשנות לעצמך תפקיד, אדמין או סטטוס')
      if ((i.is_admin !== undefined || i.position === 'mentor') && !has('users.grant_permissions')) err('אין הרשאה: users.grant_permissions')
      const r = row(i.user)
      if (!r || r.status === 'pending' || r.status === 'rejected') err('המשתמש לא נמצא', 'P0002')
      if (r!.position === 'mentor' && !has('users.grant_permissions')) err('אין הרשאה: users.grant_permissions')
      if (i.status === 'archived' && r!.status === 'active') await archive(i.user, null)
      else if (i.status === 'active' && r!.status === 'archived') restore(i.user)
      const before = { ...r! }
      Object.assign(r!, {
        full_name: i.full_name?.trim() || r!.full_name,
        team: i.clear_team ? null : i.team ?? r!.team,
        subteams: i.subteams ?? r!.subteams,
        position: i.position ?? r!.position,
        grad_year: i.grad_year ?? r!.grad_year,
        is_admin: i.is_admin ?? r!.is_admin,
      })
      const diff: Record<string, unknown> = {}
      for (const k of ['full_name', 'team', 'subteams', 'position', 'grad_year', 'is_admin'] as const) {
        if (JSON.stringify(before[k]) !== JSON.stringify(r![k])) diff[k] = [before[k], r![k]]
      }
      if (Object.keys(diff).length) audit('user.membership_changed', 'user', i.user, diff)
      commit()
    },
    async setRolePermission(role, perm, on) {
      await wait()
      if (!has('users.grant_permissions')) err('אין הרשאה: users.grant_permissions')
      if (role === 'mentor' && perm === 'users.grant_permissions' && !on) err('אי אפשר להוריד ממנטורים את ההרשאה לחלק הרשאות')
      const s = store.get()
      s.rolePerms = s.rolePerms.filter((x) => !(x.role === role && x.perm === perm))
      if (on) s.rolePerms.push({ role, perm })
      audit(on ? 'perm.role_granted' : 'perm.role_revoked', 'role', role, { perm })
      commit()
    },
    async setUserPermission(user, perm, on) {
      await wait()
      if (!has('users.grant_permissions')) err('אין הרשאה: users.grant_permissions')
      const s = store.get()
      s.userPerms = s.userPerms.filter((x) => !(x.user_id === user && x.perm === perm))
      if (on) s.userPerms.push({ user_id: user, perm, granted_by: meId(), granted_at: new Date().toISOString() })
      audit(on ? 'perm.user_granted' : 'perm.user_revoked', 'user', user, { perm })
      commit()
    },
    async inviteMember(i) {
      await wait()
      if (!has('users.edit_membership')) err('אין הרשאה: users.edit_membership')
      if (i.position === 'mentor' && !has('users.grant_permissions')) err('אין הרשאה: users.grant_permissions')
      const email = i.email.trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) err('מייל לא תקין', '22023')
      if (!phoneOk(i.phone)) err('מספר טלפון לא תקין', '23514')
      const s = store.get()
      if (s.rows.some((r) => r.email.toLowerCase() === email)) err('כבר יש חבר/ה עם המייל הזה', '23505')
      const id = `inv-${Date.now().toString(36)}`
      s.rows.push(P(id, i.full_name.trim(), { email, team: i.team, position: i.position, grad_year: i.grad_year, phone: i.phone, subteams: i.subteams, birth_date: null, invited: true, decided_by: meId(), decided_at: new Date().toISOString(), created_at: new Date().toISOString() }))
      audit('user.invited', 'user', id, { team: i.team, position: i.position })
      commit()
      return id
    },
    async updateInvite(user, email, phone, birth_date) {
      await wait()
      if (!has('users.edit_membership')) err('אין הרשאה: users.edit_membership')
      const r = row(user)
      if (!r || !r.invited) err('אפשר לערוך כאן רק מי שעוד לא התחבר/ה', 'P0002')
      const e = email.trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) err('מייל לא תקין', '22023')
      if (store.get().rows.some((x) => x.id !== user && x.email.toLowerCase() === e)) err('כבר יש פרופיל עם המייל הזה', '23505')
      if (!phoneOk(phone)) err('מספר טלפון לא תקין', '23514')
      Object.assign(r!, { email: e, phone: phone || null, birth_date: birth_date || null })
      audit('user.invite_edited', 'user', user, {})
      commit()
    },
    async claimMyProfile() {
      const s = store.get()
      if (s.me !== 'new' && meId() !== 'u-new') return false
      const inv = s.rows.find((r) => r.invited && r.email.toLowerCase() === (s.newUser?.email ?? '').toLowerCase())
      if (!inv) return false
      s.rows = s.rows.filter((r) => r.id !== 'u-new')
      Object.assign(inv, { id: 'u-new', invited: false })
      commit()
      return true
    },
    async archiveMember(user, reason) { await wait(); await archive(user, reason); commit() },
    async restoreMember(user) { await wait(); restore(user); commit() },
    async archives(user) {
      await wait()
      if (!has('users.edit_membership')) return []
      return store.get().archives.filter((a) => !user || a.user_id === user)
    },
  }
}

// a little history so the audit screen is not empty in the preview
;(function seedAudit() {
  const s = store.get()
  if (s.audit.length) return
  const at = (d: string) => new Date(d).toISOString()
  s.audit = [
    { id: 3, at: at('2026-11-14T19:02:00Z'), actor: 'u1', actor_name: 'דנה לוי', action: 'user.membership_changed', target_type: 'user', target_id: 'u15', details: { status: ['active', 'archived'] } },
    { id: 2, at: at('2026-11-10T17:40:00Z'), actor: 'u3', actor_name: 'נועה ברק', action: 'user.approved', target_type: 'user', target_id: 'u18', details: { team: 'cad', position: 'member' } },
    { id: 1, at: at('2026-11-02T16:15:00Z'), actor: 'u1', actor_name: 'דנה לוי', action: 'perm.role_granted', target_type: 'role', target_id: 'team_lead', details: { perm: 'users.view_phone' } },
  ]
})()
