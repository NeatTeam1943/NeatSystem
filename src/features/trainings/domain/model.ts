import type { Person } from '@/core/api'
import { gradeOf } from '@/core/labels'
import type {
  Category, Cert, Column, CurrentRank, Item, ItemState, Membership, PrereqGroup, Rank, RankRule, TrainingsEvent, TrainingsPerms, TrainingsState,
} from './types'

/**
 * The read model: pure queries over one snapshot of the state plus
 * NeatSystem's people. Mirrors the SQL (0002_trainings.sql): the database
 * decides, this only shows (and hides buttons the server would refuse).
 */
export const STATE_HE: Record<ItemState, string> = { locked: 'נעול', open: 'פתוח ללמידה', held: 'מוסמך/ת' }
export const GATE_HE: Record<number, string> = { 9: "ט'", 10: "י'", 11: "יא'", 12: "יב'", 99: 'מנטורים' }
const GRADE_HE: Record<number, string> = { 7: "ז'", 8: "ח'", 9: "ט'", 10: "י'", 11: "יא'", 12: "יב'" }

const key = (a: string | null | undefined, b: string | null | undefined) => `${a}|${b}`
const bySort = <T extends { sort: number }>(a: T, b: T) => a.sort - b.sort

export interface RankGap { missing: string[]; gradeOk: boolean; configured: boolean; eligible: boolean }
export interface NextRank { rank: Rank; missing: string[]; gradeOk: boolean; gradeNeeded: number | null; have: number; total: number }
export interface RankSuggestion { from: Rank | null; to: Rank }
export interface GroupStatus extends PrereqGroup { met: number; need: number }

export class TrainingsModel {
  readonly perms: TrainingsPerms
  readonly me: Person | null
  private readonly P: Map<string, Person>
  private readonly cats: Category[]
  private readonly catBy: Map<string, Category>
  private readonly items: Item[]
  private readonly itemBy: Map<string, Item>
  private readonly certs: Map<string, Cert>
  private readonly mships: Map<string, TrainingsState['memberships'][number]>
  private readonly favs: Map<string, string>
  private readonly access: Set<string>
  private readonly appointed: Set<string>
  private readonly locks: Set<string>
  private readonly rankList: Rank[]
  private readonly rankBy: Map<string, Rank>
  private readonly rules: Map<string, RankRule>
  private readonly current: Map<string, CurrentRank>

  constructor(readonly S: TrainingsState, private readonly people: Person[], private readonly meId: string) {
    this.P = new Map(people.map((p) => [p.id, p]))
    this.cats = [...S.categories].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'he'))
    this.catBy = new Map(this.cats.map((c) => [c.id, c]))
    this.items = [...S.items].sort(bySort)
    this.itemBy = new Map(this.items.map((i) => [i.id, i]))
    this.certs = new Map(S.certs.map((c) => [key(c.user, c.item), c]))
    this.mships = new Map(S.memberships.map((m) => [key(m.user, m.category), m]))
    this.favs = new Map(S.favorites.map((f) => [key(f.user, f.category), f.text]))
    this.access = new Set(S.access.map((a) => key(a.user, a.category)))
    this.appointed = new Set(S.approvers.map((a) => key(a.user, a.category)))
    this.locks = new Set(S.locks.map((a) => key(a.user, a.category)))
    this.rankList = [...S.ranks].sort(bySort)
    this.rankBy = new Map(this.rankList.map((r) => [r.id, r]))
    this.rules = new Map(S.rules.map((r) => [key(r.category, r.rank), r]))
    this.current = new Map(S.current.map((r) => [key(r.user, r.category), r]))
    this.perms = S.perms
    this.me = this.P.get(meId) ?? null
  }

  // ---------------------------------------------------------------- people
  person = (id: string | null | undefined): Person | null => (id ? this.P.get(id) ?? null : null)
  nameOf = (id: string | null | undefined) => this.person(id)?.full_name ?? 'לא ידוע'
  isMentor = (u: Person | null | undefined) => u?.position === 'mentor'
  isActive = (u: Person | null | undefined) => u?.status === 'active'
  /** For rank gates. An unknown grade (no graduation year) doesn't block a rank — same as trainings.grade_of(). */
  grade = (u: Person | null | undefined) => (this.isMentor(u) ? 99 : !u?.grad_year ? 12 : gradeOf(u.grad_year) ?? 13)
  gradeLabel = (u: Person | null | undefined) => (this.isMentor(u) ? 'מנטור/ית' : GRADE_HE[gradeOf(u?.grad_year ?? null) ?? 0] ?? (u?.grad_year ? 'בוגר/ת' : ''))
  activePeople = () => this.people.filter((p) => p.status === 'active' || p.status === 'archived')

  // ---------------------------------------------------------------- catalog
  categories = () => this.cats
  category = (id: string | null | undefined) => (id ? this.catBy.get(id) ?? null : null)
  teamCategory = (team: string | null | undefined) => this.cats.find((c) => c.kind === 'team' && c.team === team) ?? null
  columnsOf = (catId: string): Column[] => this.catBy.get(catId)?.columns ?? []
  item = (id: string | null | undefined) => (id ? this.itemBy.get(id) ?? null : null)
  itemsOf = (catId: string) => this.items.filter((i) => i.category === catId)
  itemsInColumn = (catId: string, col: string) => this.items.filter((i) => i.category === catId && i.column === col)
  ranks = () => this.rankList
  rank = (id: string | null | undefined) => (id ? this.rankBy.get(id) ?? null : null)

  // ---------------------------------------------------------------- records
  rec = (u: string, i: string) => this.certs.get(key(u, i)) ?? null
  isHeld = (u: string, i: string) => this.certs.has(key(u, i))
  favoriteOf = (u: string, c: string) => this.favs.get(key(u, c)) ?? ''
  events = ({ user, cat }: { user?: string; cat?: string } = {}): TrainingsEvent[] =>
    this.S.events.filter((e) => (!user || e.user === user) && (!cat || e.category === cat))
  heldIn = (u: string, catId: string) => this.itemsOf(catId).filter((i) => this.isHeld(u, i.id))
  heldCount = (u: string) => this.S.certs.filter((c) => c.user === u && this.itemBy.has(c.item)).length
  teachCount = (u: string, catId: string) => this.heldIn(u, catId).filter((i) => this.rec(u, i.id)?.teach).length
  holdersOf = (i: string) => this.S.certs.filter((c) => c.item === i).map((c) => this.P.get(c.user)).filter((p): p is Person => !!p)
  teachersOf = (i: string) => this.S.certs.filter((c) => c.item === i && c.teach).map((c) => this.P.get(c.user)).filter((u): u is Person => !!u && this.isActive(u))

  // ---------------------------------------------------------------- membership (trainings.membership())
  membership = (uid: string | null | undefined, catId: string): Membership | null => {
    const u = this.person(uid), c = this.catBy.get(catId)
    if (!u || !c) return null
    const m = this.mships.get(key(uid, catId))
    if (m?.kind === 'paused' || (m && !m.active)) return { kind: m.kind, active: false }
    // a mentor belongs to their team, or to every team when they have none
    if (c.kind === 'team' && (u.team === c.team || (this.isMentor(u) && !u.team))) return { kind: 'team', active: this.isActive(u) }
    if (c.kind === 'special' && this.access.has(key(uid, catId))) return { kind: 'special', active: this.isActive(u) }
    if (m?.kind === 'extra') return { kind: 'extra', active: this.isActive(u) }
    if (this.heldIn(u.id, catId).length) return { kind: 'former', active: false }
    return null
  }
  isMember = (uid: string, catId: string) => !!this.membership(uid, catId)?.active
  membersOf = (catId: string) => this.people.filter((u) => this.membership(u.id, catId))
  categoriesOf = (uid: string) => this.cats.filter((c) => this.membership(uid, c.id))
  hasAccess = (uid: string, catId: string) => this.access.has(key(uid, catId))

  // ---------------------------------------------------------------- who may do what (trainings.is_approver() …)
  /** For other people only their position is known here, not their extra permissions. */
  private certifiesAll = (u: Person) => (u.id === this.meId ? this.perms.certifyAll : this.isMentor(u) || u.position === 'captain' || u.is_admin)
  isApprover = (u: Person | null | undefined, catId: string) => {
    const c = this.catBy.get(catId)
    if (!u || !c || !this.isActive(u)) return false
    return this.certifiesAll(u) || this.appointed.has(key(u.id, catId)) || (c.kind === 'team' && u.position === 'team_lead' && u.team === c.team)
  }
  isAppointed = (u: Person | null | undefined, catId: string) => this.appointed.has(key(u?.id, catId))
  approversOf = (catId: string) => this.people.filter((u) => this.isApprover(u, catId))
  isLocked = (u: Person | null | undefined, catId: string) => !!u && this.locks.has(key(u.id, catId))
  canGrant = (u: Person | null | undefined, catId: string) => this.isApprover(u, catId) && !this.isLocked(u, catId)
  canEditCatalog = (u: Person | null | undefined, catId: string) => {
    const c = this.catBy.get(catId)
    if (!u || !c || !this.isActive(u)) return false
    if (u.id === this.meId && this.perms.editCatalog) return true
    return c.kind === 'team' && u.position === 'team_lead' && u.team === c.team && !this.isLocked(u, catId)
  }
  canManage = () => this.perms.manage
  visibleCategories = (u: Person | null | undefined) =>
    this.cats.filter((c) => c.kind === 'team' || this.canManage() || this.perms.certifyAll || this.membership(u?.id, c.id) || this.isApprover(u, c.id))

  // ---------------------------------------------------------------- prerequisites: held · open · locked (a lead may still certify a locked item = early unlock)
  private groupMet = (uid: string, g: PrereqGroup) => {
    const ids = (g.ids ?? []).filter((id) => this.itemBy.has(id))
    if (!ids.length) return true
    const met = ids.filter((id) => this.isHeld(uid, id)).length
    return g.mode === 'all' ? met === ids.length : met >= Math.min(g.n ?? 1, ids.length)
  }
  stateOf = (uid: string, i: Item): ItemState => (this.isHeld(uid, i.id) ? 'held' : (i.groups ?? []).every((g) => this.groupMet(uid, g)) ? 'open' : 'locked')
  groupStatus = (uid: string, g: PrereqGroup): GroupStatus => ({
    ...g, met: (g.ids ?? []).filter((id) => this.isHeld(uid, id)).length, need: g.mode === 'all' ? g.ids.length : Math.min(g.n ?? 1, g.ids.length),
  })
  nextToLearn = (uid: string): Item[] => {
    const u = this.person(uid), own = this.teamCategory(u?.team)?.id, out: Item[] = []
    if (this.isMentor(u)) return out
    for (const c of this.categoriesOf(uid)) if (this.isMember(uid, c.id)) for (const i of this.itemsOf(c.id)) if (this.stateOf(uid, i) === 'open') out.push(i)
    return out.sort((a, b) => (a.category === own ? 0 : 1) - (b.category === own ? 0 : 1) || this.levelOf(a) - this.levelOf(b) || a.sort - b.sort)
  }

  // ---------------------------------------------------------------- ranks (trainings.earned_rank())
  requirement = (catId: string, rankId: string) => {
    const r = this.rules.get(key(catId, rankId))
    return { items: (r?.items ?? []).filter((id) => this.itemBy.has(id)), minGrade: r ? r.minGrade : null }
  }
  isConfigured = (catId: string, rankId: string) => { const r = this.requirement(catId, rankId); return r.items.length > 0 || r.minGrade != null }
  cumulative = (catId: string, rankId: string) => {
    const i = this.rankList.findIndex((r) => r.id === rankId)
    return i < 0 ? [] : this.rankList.slice(0, i + 1).flatMap((r) => this.requirement(catId, r.id).items)
  }
  ownerOf = (catId: string, itemId: string) => this.rankList.find((r) => this.requirement(catId, r.id).items.includes(itemId))?.id ?? null
  levelOf = (i: Item) => { const o = this.ownerOf(i.category, i.id); return o ? this.rankList.findIndex((r) => r.id === o) : this.rankList.length }
  gap = (u: Person, catId: string, rankId: string): RankGap => {
    const missing = this.cumulative(catId, rankId).filter((id) => !this.isHeld(u.id, id))
    const { minGrade } = this.requirement(catId, rankId)
    const gradeOk = minGrade == null || this.grade(u) >= minGrade
    const configured = this.isConfigured(catId, rankId)
    return { missing, gradeOk, configured, eligible: !missing.length && gradeOk && configured }
  }
  earned = (u: Person, catId: string) => {
    let e: Rank | null = null
    for (const r of this.rankList) { if (!this.gap(u, catId, r.id).eligible) break; e = r }
    return e
  }
  rankIn = (uid: string, catId: string): Rank | null =>
    this.isMentor(this.person(uid)) ? this.rankBy.get('nitmentor') ?? null : this.rank(this.current.get(key(uid, catId))?.rank)
  isManual = (uid: string, catId: string) => !!this.current.get(key(uid, catId))?.manual
  suggestion = (uid: string, catId: string): RankSuggestion | null => {
    const u = this.person(uid)
    if (!u || !this.isManual(uid, catId) || !this.isMember(uid, catId)) return null
    const e = this.earned(u, catId), cur = this.rankIn(uid, catId)
    return e && this.rankList.indexOf(e) > (cur ? this.rankList.indexOf(cur) : -1) ? { from: cur, to: e } : null
  }
  suggestionsIn = (catId: string) =>
    this.membersOf(catId).map((u) => [u, this.suggestion(u.id, catId)] as const).filter((x): x is readonly [Person, RankSuggestion] => !!x[1])
  next = (uid: string, catId: string): NextRank | null => {
    const u = this.person(uid), cur = this.rankIn(uid, catId)
    const nx = this.rankList[cur ? this.rankList.indexOf(cur) + 1 : 0]
    if (!u || !nx || !this.isConfigured(catId, nx.id) || this.isMentor(u)) return null
    const g = this.gap(u, catId, nx.id), req = this.cumulative(catId, nx.id)
    return { rank: nx, missing: g.missing, gradeOk: g.gradeOk, gradeNeeded: this.requirement(catId, nx.id).minGrade, have: req.length - g.missing.length, total: req.length }
  }
  teamRank = (uid: string) => {
    const u = this.person(uid)
    if (this.isMentor(u)) return this.rankBy.get('nitmentor') ?? null
    const c = this.teamCategory(u?.team)
    return c ? this.rankIn(uid, c.id) : null
  }
}
