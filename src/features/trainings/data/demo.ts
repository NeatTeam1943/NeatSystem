import type { Person } from '@/core/api'
import type { Column, Item, TrainingsState } from '../domain/types'

/**
 * Sample catalog + a believable spread of progress for the preview's invented
 * people. Never used with Supabase (there the catalog comes from the migration).
 */
const COLS = (rows: [string, string, string | undefined, string][]): Column[] => rows.map(([id, he, label, header]) => ({ id, he, label: label ?? he, header }))
const STAGE = ['שלב א׳', 'שלב ב׳', 'שלב ג׳', 'שלב ד׳', 'שלב ה׳', 'שלב ו׳', 'שלב ז׳']
const SW = ['#6D6D6D', '#04255A', '#1B4922', '#653A27', '#7A1220', '#3B2A6B', '#0E7490']
const BUILD: [string, string, string, string, string[]][] = [
  ['basic_training', 'הכשרה בסיסית', 'BASIC TRAINING', '#747474', ['ברגים', 'אומים', 'חומרים', 'לקיחת מידות', 'מקדחים', 'זוויות', 'מפתחות', 'ניטים', 'מנועים', 'תמסורות']],
  ['basic_tools', 'כלים בסיסיים', 'BASIC TOOLS', '#002060', ['מקדחה', 'מברגה', 'ניטר פנאומטי', 'מסור ידני', 'שופין', 'שואב אבק', 'ניטר']],
  ['power_tools', 'כלי כוח', 'POWER TOOLS', '#12501B', ["ג'יגסו", 'דיסק ידני', 'דרמל (שיוף)', 'דרמל (חיתוך)', 'מולטי-טול', 'משייף חשמלי']],
  ['bench_tools', 'כלי שולחן', 'BENCH TOOLS', '#7F340D', ['מסור שולחן', 'רצועת שיוף', 'מקדחת עמוד', 'דיסק שולחן', 'גריינדר']],
  ['heavy_machinery', 'מכונות כבדות', 'HEAVY MACHINERY', '#5E0202', ['מסור סרט', 'ZK', 'מחרטה']],
]
const BUILD_RULES: [string, string[], number | null][] = [
  ['nit', ['ברגים', 'אומים', 'חומרים', 'לקיחת מידות', 'מקדחים', 'זוויות', 'מפתחות', 'ניטים'], null],
  ['niter', ['מקדחה', 'מברגה', 'מסור ידני', 'שופין', 'ניטר', 'שואב אבק', 'רצועת שיוף', 'מנועים', 'תמסורות'], null],
  ['nitolog', ['מקדחת עמוד', 'משייף חשמלי', 'ניטר פנאומטי', 'דיסק ידני', "ג'יגסו", 'מסור שולחן'], null],
  ['nitpro', ['דרמל (שיוף)', 'דרמל (חיתוך)', 'מולטי-טול', 'מסור סרט', 'גריינדר'], null],
  ['nitprime', ['דיסק שולחן'], 10], ['nitelite', ['ZK'], 11], ['nitmaster', [], 12], ['nitmentor', [], 99],
]
const STAGED: Record<string, string[][]> = {
  software: [['Dog', 'Java basics', 'OOP', 'Git', 'Cool For The Summer'], ['אלקטרוניקה 101', 'הלחמה', 'הרובוט הראשון שלי'], ['SOLID', 'Clean Code', 'Conventions'],
    ['Command Based', 'Unit testing'], ['Autonomous Routines', 'PIDF'], ['Vision', 'Code Reviewing'], ['Swerve']],
  cad: [['Basic entities', 'Smart dimension', 'Extrude boss', 'Relations', 'Extrude Cut'], ['Revolve', 'Fillet & Chamfer', 'Basic Mates', 'Mirror feature'],
    ['Shell', 'Configurations', 'Patterns', '3D Printing'], ['Measure', 'Tolerances', 'Equations'], ['Drawing', 'Gears', 'Pulleys & Belts'], ['Master Sketch'], ['Fully Master Assembly']],
  cnc: [['שרטוט בסיסי', 'Setup תוכנתי'], ['איפוס', 'קיבוע חלק', 'הפעלת מכונה'], ['אירועי בטיחות'], ['שחזור הרצה שנכשלה']],
}
export const RANKS: [string, string, string, number | null, string][] = [
  ['nit', 'ניט', '#8C5A3C', null, 'bronze-shield'], ['niter', 'ניטר', '#8E949C', null, 'silver-shield'], ['nitolog', 'ניטולוג', '#C9A200', null, 'gold-gear'],
  ['nitpro', 'ניטפרו', '#2D7FC1', null, 'steel-gear'], ['nitprime', 'ניטפריים', '#00A88E', 10, 'frost'], ['nitelite', 'ניטאליט', '#A05BE0', 11, 'arcane'],
  ['nitmaster', 'ניטמאסטר', '#E2445C', 12, 'flame'], ['nitmentor', 'ניטמנטור', '#6B7280', 99, 'mentor']]
export { STAGE, SW }

let n = 0
export const newId = (p: string) => `${p}${(++n).toString(36)}${Math.random().toString(36).slice(2, 6)}`
const hash = (s: string) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h }

export function demoState(people: Person[]): Omit<TrainingsState, 'perms'> {
  const S: Omit<TrainingsState, 'perms'> = { categories: [], items: [], certs: [], memberships: [], favorites: [], access: [], approvers: [], locks: [], ranks: [], rules: [], current: [], events: [] }
  S.ranks = RANKS.map(([id, name, color, minGrade, badge], sort) => ({ id, name, color, min_grade: minGrade, sort, badge, wordmark: id }))
  S.categories.push({ id: 'build', name: 'בנייה', kind: 'team', team: 'build', icon: 'hammer', sort: 2, item_noun: 'כלים', item_noun_singular: 'כלי', favorite_label: 'כלי אהוב', columns: COLS(BUILD.map(([id, he, label, header]) => [id, he, label, header])) })
  let s = 0
  for (const [col, , , , names] of BUILD) for (const nm of names) S.items.push({ id: `build:${nm}`, category: 'build', name: nm, column: col, icon: null, desc: '', groups: [], sort: s++ })
  for (const [rk, names, mg] of BUILD_RULES) S.rules.push({ category: 'build', rank: rk, items: names.map((x) => `build:${x}`), minGrade: mg })
  const staged = (cid: string, name: string, kind: 'team' | 'special', team: string | null, icon: string, sort: number, fav: string) => {
    const lv = STAGED[cid]
    S.categories.push({ id: cid, name, kind, team, icon, sort, item_noun: 'הכשרות', item_noun_singular: 'הכשרה', favorite_label: fav, columns: lv.map((_, i) => ({ id: `${cid}_s${i}`, he: STAGE[i], label: STAGE[i], header: SW[i % SW.length] })) })
    let prev: string[] = []
    lv.forEach((names, l) => {
      const ids = names.map((nm, i) => {
        const id = `${cid}:${nm}`
        const groups: Item['groups'] = !prev.length ? [] : i % 3 === 2 && prev.length > 1 ? [{ mode: 'at_least', n: 1, ids: prev }] : [{ mode: 'all', n: 1, ids: [prev[i % prev.length]] }]
        S.items.push({ id, category: cid, name: nm, column: `${cid}_s${l}`, icon: null, desc: '', groups, sort: s++ })
        return id
      })
      if (l < RANKS.length) S.rules.push({ category: cid, rank: RANKS[l][0], items: ids, minGrade: RANKS[l][3] })
      prev = ids
    })
  }
  staged('cad', 'שרטוט', 'team', 'cad', 'pencil-ruler', 1, 'פיצ׳ר אהוב')
  staged('software', 'תוכנה', 'team', 'software', 'code', 3, 'שפה אהובה')
  staged('cnc', 'CNC', 'special', null, 'factory', 20, 'דבר אהוב')

  const t0 = Date.UTC(2026, 8, 6)
  const mentor = people.find((p) => p.position === 'mentor')?.id ?? null
  const leadOf = (team: string) => people.find((p) => p.position === 'team_lead' && p.team === team && p.status === 'active')?.id ?? mentor
  for (const p of people) {
    if (p.position === 'mentor' || !p.team || p.status === 'pending' || p.status === 'rejected') continue
    const list = S.items.filter((i) => i.category === p.team)
    const share = ({ team_lead: 0.85, captain: 0.9, member: 0.45 } as Record<string, number>)[p.position ?? ''] ?? 0.3
    const k = Math.round(list.length * share * (0.7 + (hash(p.id) % 30) / 100))
    list.slice(0, k).forEach((i, j) => {
      const at = new Date(t0 + (j * 3 + (hash(p.id) % 5)) * 864e5).toISOString()
      const by = leadOf(p.team!) === p.id ? mentor : leadOf(p.team!)
      S.certs.push({ user: p.id, item: i.id, at, by, teach: (p.position === 'team_lead' || p.position === 'captain') && j % 2 === 0, teachAt: at, early: false })
      if (j >= k - 2) S.events.push({ id: newId('e'), at, by, type: 'granted', user: p.id, category: p.team, item: i.id, text: null, early: false })
    })
    if (hash(p.id) % 3 === 0) S.favorites.push({ user: p.id, category: p.team, text: list[Math.min(2, list.length - 1)]?.name ?? '' })
  }
  const cnc = people.filter((p) => p.status === 'active' && p.team === 'build' && p.position === 'member').slice(0, 3)
  cnc.forEach((p, j) => {
    S.access.push({ user: p.id, category: 'cnc' })
    S.items.filter((i) => i.category === 'cnc').slice(0, 2 + j).forEach((i) => S.certs.push({ user: p.id, item: i.id, at: new Date(t0 + j * 864e5).toISOString(), by: null, teach: false, teachAt: null, early: false }))
  })
  const noted = people.find((p) => p.team === 'build' && p.position === 'member' && p.status === 'active')
  if (noted) S.events.push({ id: newId('e'), at: '2026-11-12T16:40:00Z', by: leadOf('build'), type: 'note', user: noted.id, category: 'build', item: null, text: 'עבד/ה יפה על השלדה. מוכן/ה להתחיל ללמוד מסור סרט.', early: false })
  S.events.sort((a, b) => b.at.localeCompare(a.at))
  return S
}
