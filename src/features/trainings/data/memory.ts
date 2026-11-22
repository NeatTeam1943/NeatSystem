import type { Person } from '@/core/api'
import { TrainingsModel } from '../domain/model'
import type { TrainingsPerms, TrainingsState } from '../domain/types'
import { demoState, newId, STAGE, SW } from './demo'
import type { TrainingsActions, TrainingsRepository, TrainingsSnapshot } from './repository'

/** Who is asking, in the preview (NeatSystem's mock persona). */
export interface MemoryContext { me: Person; people: Person[]; can: (perm: string) => boolean }

type Data = Omit<TrainingsState, 'perms'>
type Handlers = { [K in keyof TrainingsActions]: (args: TrainingsActions[K]) => unknown }

/**
 * The preview's backend: the same actions and permission rules as the SQL
 * functions (0002_trainings.sql), on the demo data, in memory. The SQL is the
 * source of truth; this follows it.
 */
export interface MemoryTrainingsRepository extends TrainingsRepository {
  /** The same shape as trainings.snapshot(uuid): what the archive keeps of a person. */
  snapshot(user: string): TrainingsSnapshot
}

export function memoryTrainingsRepository(ctx: () => MemoryContext): MemoryTrainingsRepository {
  let S: Data | null = null
  const data = () => (S ??= seeded())
  const perms = (): TrainingsPerms => {
    const c = ctx()
    return { certifyAll: c.can('trainings.certify_all'), editCatalog: c.can('trainings.edit_catalog'), manage: c.can('trainings.manage') }
  }
  const M = () => new TrainingsModel({ ...data(), perms: perms() }, ctx().people, ctx().me.id)
  const me = () => ctx().me
  const deny = (m = 'אין לך הרשאה לפעולה הזו'): never => { throw new Error(m) }
  const now = () => new Date().toISOString()
  const ev = (type: string, user: string | null, category: string | null, item: string | null = null, text: string | null = null, early = false) =>
    data().events.unshift({ id: newId('e'), at: now(), by: me().id, type, user, category, item, text, early })
  const itemCat = (iid: string) => data().items.find((i) => i.id === iid)?.category ?? deny('הפריט לא קיים')
  const needGrant = (cat: string) => { if (!M().canGrant(me(), cat)) deny() }
  const needCatalog = (cat: string) => { if (!M().canEditCatalog(me(), cat)) deny() }
  const needManage = (msg: string) => { if (!ctx().can('trainings.manage')) deny(msg) }
  const cur = (u: string, c: string) => data().current.find((r) => r.user === u && r.category === c)
  const syncRank = (u: string, c: string, quiet = false) => {
    const m = M(), r = cur(u, c), p = m.person(u)
    if (r?.manual || !p || !m.isMember(u, c)) return
    const e = m.earned(p, c)?.id ?? null
    if (r && r.rank === e) return
    if (r) r.rank = e
    else if (e || !quiet) data().current.push({ user: u, category: c, rank: e, manual: false })
    if (!quiet) ev('rank_auto', u, c, e)
  }
  const syncCategory = (c: string) => { for (const u of new Set(data().certs.filter((x) => itemCat(x.item) === c).map((x) => x.user))) syncRank(u, c) }
  function seeded(): Data {
    const people = ctx().people
    S = demoState(people)
    const m = new TrainingsModel({ ...S, perms: perms() }, people, ctx().me.id)
    for (const c of S.categories) for (const p of people) if (p.status === 'active' && m.isMember(p.id, c.id)) {
      const e = m.earned(p, c.id)?.id
      if (e) S.current.push({ user: p.id, category: c.id, rank: e, manual: false })
    }
    return S
  }

  const handlers: Handlers = {
    grant({ p_user, p_item }) {
      const c = itemCat(p_item); needGrant(c)
      if (p_user === me().id) deny('אי אפשר להסמיך את עצמך')
      if (!M().isMember(p_user, c)) deny('לא חבר/ה פעיל/ה בקטגוריה הזו')
      if (M().isHeld(p_user, p_item)) return
      const early = M().stateOf(p_user, M().item(p_item)!) === 'locked'
      data().certs.push({ user: p_user, item: p_item, at: now(), by: me().id, teach: false, teachAt: null, early })
      ev('granted', p_user, c, p_item, null, early); syncRank(p_user, c)
    },
    revoke({ p_user, p_item }) {
      const c = itemCat(p_item); needGrant(c)
      const d = data(), before = d.certs.length
      d.certs = d.certs.filter((x) => !(x.user === p_user && x.item === p_item))
      if (d.certs.length === before) return
      ev('revoked', p_user, c, p_item); syncRank(p_user, c)
    },
    set_teach({ p_user, p_item, p_on }) {
      const c = itemCat(p_item); needGrant(c)
      const r = data().certs.find((x) => x.user === p_user && x.item === p_item) ?? deny('קודם צריך להיות מוסמך/ת')
      if (r.teach === p_on) return
      r.teach = p_on; r.teachAt = now(); ev(p_on ? 'teach_granted' : 'teach_revoked', p_user, c, p_item)
    },
    add_note({ p_user, p_cat, p_text }) { needGrant(p_cat); if (!p_text?.trim()) deny('צריך טקסט'); ev('note', p_user, p_cat, null, p_text.trim()) },
    clear_log({ p_user }) {
      needManage('רק מנטור מנקה יומן')
      const d = data(), k = d.events.filter((e) => e.user === p_user).length
      d.events = d.events.filter((e) => e.user !== p_user)
      ev('log_cleared', p_user, null, null, String(k)); return k
    },
    set_favorite({ p_user, p_cat, p_text }) {
      if (p_user !== me().id) needGrant(p_cat)
      const d = data()
      d.favorites = d.favorites.filter((f) => !(f.user === p_user && f.category === p_cat))
      if (p_text?.trim()) d.favorites.push({ user: p_user, category: p_cat, text: p_text.trim().slice(0, 40) })
    },
    join({ p_user, p_cat }) {
      needGrant(p_cat)
      if (M().isMember(p_user, p_cat)) return
      const d = data()
      d.memberships = d.memberships.filter((m) => !(m.user === p_user && m.category === p_cat))
      d.memberships.push({ user: p_user, category: p_cat, kind: 'extra', active: true, joinedAt: now() })
      ev('joined', p_user, p_cat); syncRank(p_user, p_cat)
    },
    set_active({ p_user, p_cat, p_active }) {
      needGrant(p_cat)
      const d = data(), m = d.memberships.find((x) => x.user === p_user && x.category === p_cat)
      if (!p_active) { if (m) m.active = false; else d.memberships.push({ user: p_user, category: p_cat, kind: 'paused', active: false, joinedAt: now() }) }
      else if (m?.kind === 'paused') d.memberships = d.memberships.filter((x) => x !== m)
      else if (m) m.active = true
      ev(p_active ? 'reactivated' : 'deactivated', p_user, p_cat)
      if (p_active) syncRank(p_user, p_cat)
    },
    set_rank({ p_user, p_cat, p_rank }) {
      needGrant(p_cat)
      const r = cur(p_user, p_cat), old = r?.rank ?? null
      if (r) Object.assign(r, { rank: p_rank, manual: true }); else data().current.push({ user: p_user, category: p_cat, rank: p_rank, manual: true })
      ev('rank_set', p_user, p_cat, p_rank, old)
    },
    set_auto({ p_user, p_cat }) { needGrant(p_cat); const r = cur(p_user, p_cat); if (r) r.manual = false; ev('auto_rank_on', p_user, p_cat); syncRank(p_user, p_cat) },
    set_requirement({ p_cat, p_rank, p_items, p_min_grade }) {
      needCatalog(p_cat)
      const d = data()
      for (const r of d.rules) if (r.category === p_cat && r.rank !== p_rank) r.items = r.items.filter((x) => !p_items.includes(x))
      const r = d.rules.find((x) => x.category === p_cat && x.rank === p_rank)
      if (r) Object.assign(r, { items: [...p_items], minGrade: p_min_grade }); else d.rules.push({ category: p_cat, rank: p_rank, items: [...p_items], minGrade: p_min_grade })
      ev('ladder_updated', null, p_cat, p_rank); syncCategory(p_cat)
    },
    add_item({ p_cat, p_column, p_name, p_after }) {
      needCatalog(p_cat)
      const nm = p_name?.trim() || deny('צריך שם'), d = data()
      if (d.items.some((i) => i.category === p_cat && i.name === nm)) deny('כבר קיים')
      if (!M().columnsOf(p_cat).some((c) => c.id === p_column)) deny('עמודה לא קיימת')
      const id = newId('i_')
      d.items.push({ id, category: p_cat, name: nm, column: p_column, icon: null, desc: '', groups: p_after ? [{ mode: 'all', n: 1, ids: [p_after] }] : [], sort: Math.max(0, ...d.items.map((i) => i.sort)) + 1 })
      ev('item_created', null, p_cat, id); return id
    },
    update_item({ p_item, p_patch }) {
      const c = itemCat(p_item); needCatalog(c)
      const i = data().items.find((x) => x.id === p_item)!, old = i.name
      if (p_patch.column && !M().columnsOf(c).some((x) => x.id === p_patch.column)) deny('עמודה לא קיימת')
      if (p_patch.name?.trim()) i.name = p_patch.name.trim()
      if (p_patch.column) i.column = p_patch.column
      if (p_patch.desc !== undefined) i.desc = p_patch.desc
      if ('after' in p_patch) i.groups = p_patch.after && p_patch.after !== p_item && itemCat(p_patch.after) === c ? [{ mode: 'all', n: 1, ids: [p_patch.after] }] : []
      if (p_patch.name && old !== i.name) ev('item_renamed', null, c, p_item, old)
    },
    delete_item({ p_item }) {
      const c = itemCat(p_item); needCatalog(c)
      const d = data(), nm = d.items.find((x) => x.id === p_item)?.name ?? null
      d.items = d.items.filter((x) => x.id !== p_item)
      d.certs = d.certs.filter((x) => x.item !== p_item)
      for (const r of d.rules) if (r.category === c) r.items = r.items.filter((x) => x !== p_item)
      for (const i of d.items) i.groups = i.groups.map((g) => ({ ...g, ids: g.ids.filter((x) => x !== p_item) })).filter((g) => g.ids.length)
      ev('item_deleted', null, c, null, nm); syncCategory(c)
    },
    update_category({ p_cat, p_patch }) {
      needCatalog(p_cat)
      const d = data(), c = d.categories.find((x) => x.id === p_cat)!
      if (p_patch.columns) {
        const cols = p_patch.columns
        if (!cols.length || cols.some((x) => !x.id || !x.he?.trim())) deny('עמודות לא תקינות')
        for (const i of d.items.filter((x) => x.category === p_cat && !cols.some((col) => col.id === x.column))) handlers.delete_item({ p_item: i.id })
        c.columns = cols
      }
      for (const k of ['name', 'item_noun', 'item_noun_singular', 'favorite_label'] as const) { const v = p_patch[k]?.trim(); if (v) c[k] = v }
      ev('category_updated', null, p_cat)
    },
    create_category({ p_name, p_team }) {
      needManage('רק מנטור יוצר קטגוריה')
      const name = p_name?.trim() || deny('צריך שם'), d = data()
      const id = p_team ?? newId('x')
      if (d.categories.some((c) => c.id === id)) deny('לצוות כבר יש קטגוריה')
      d.categories.push({ id, name, kind: p_team ? 'team' : 'special', team: p_team ?? null, icon: 'award', sort: p_team ? 5 : 20, item_noun: 'הכשרות', item_noun_singular: 'הכשרה', favorite_label: 'דבר אהוב', columns: [{ id: 's0', he: STAGE[0], label: STAGE[0], header: SW[0] }] })
      ev('category_created', null, id, null, name); return id
    },
    set_approver({ p_cat, p_user, p_on }) {
      needManage('רק מנטור ממנה מאשרים')
      const d = data()
      d.approvers = d.approvers.filter((a) => !(a.user === p_user && a.category === p_cat))
      if (p_on) d.approvers.push({ user: p_user, category: p_cat })
      ev(p_on ? 'approver_added' : 'approver_removed', p_user, p_cat)
    },
    set_locked({ p_cat, p_user, p_locked }) {
      needManage('רק מנטור נועל ופותח')
      const d = data()
      d.locks = d.locks.filter((a) => !(a.user === p_user && a.category === p_cat))
      if (p_locked) d.locks.push({ user: p_user, category: p_cat })
      ev(p_locked ? 'lead_locked' : 'lead_unlocked', p_user, p_cat)
    },
    set_access({ p_cat, p_user, p_on }) {
      if (!ctx().can('trainings.manage') && !M().canGrant(me(), p_cat)) deny()
      const d = data()
      if (d.categories.find((c) => c.id === p_cat)?.kind !== 'special') deny('רק להסמכה מיוחדת יש רשימת גישה')
      d.access = d.access.filter((a) => !(a.user === p_user && a.category === p_cat))
      if (p_on) d.access.push({ user: p_user, category: p_cat })
      ev(p_on ? 'joined' : 'deactivated', p_user, p_cat)
      if (p_on) syncRank(p_user, p_cat)
    },
  }

  return {
    async load() { return structuredClone({ ...data(), perms: perms() }) },
    snapshot(user) {
      const d = data()
      const cat = (id: string) => d.categories.find((c) => c.id === id)
      const certifications = d.certs.flatMap((c) => {
        const i = d.items.find((x) => x.id === c.item)
        return c.user === user && i ? [{ category: cat(i.category)?.name ?? '', item: i.name, at: c.at, teaches: c.teach }] : []
      })
      const ranks = d.current.flatMap((r) => {
        const rank = d.ranks.find((x) => x.id === r.rank)
        return r.user === user && rank ? [{ category: cat(r.category)?.name ?? '', rank: rank.name, manual: r.manual }] : []
      })
      return { certifications, ranks }
    },
    async call(action, args) {
      const before = structuredClone(data())
      try {
        return (handlers[action] as (a: typeof args) => unknown)(args)
      } catch (e) {
        S = before
        throw e
      }
    },
  }
}
