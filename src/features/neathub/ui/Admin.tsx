import { useCallback, useEffect, useMemo, useState } from 'react'
import { House, Search } from 'lucide-react'
import { ROLE_LABEL, HOME } from '../domain/model'
import { norm } from '../domain/text'
import type { HubUser, Role } from '../domain/types'
import { useNeathub } from './NeathubContext'

const ROLE_FILTERS: ['all' | Role, string][] = [
  ['all', 'כולם'],
  ['member', 'חברי קבוצה'],
  ['lead', 'ראשי צוותים'],
  ['mentor', 'מנטורים'],
]
type Sort = 'smart' | 'name' | 'new' | 'role'
const SORTS: [Sort, string][] = [
  ['smart', 'ראשי צוותים קודם'],
  ['name', 'לפי שם'],
  ['new', 'הצטרפו לאחרונה'],
  ['role', 'לפי תפקיד'],
]
const ROLE_ORDER: Partial<Record<Role, number>> = { lead: 0, mentor: 1, member: 2 }
const time = (t: string | null) => (t ? Date.parse(t) : 0)
const byName = (a: HubUser, b: HubUser) => (a.name || a.email || '').localeCompare(b.name || b.email || '', 'he')

// Mentors pick which top-level totes (and the home page) each team lead can edit.
// Roles themselves come from NeatSystem (position + permissions), not from here.
export function Admin() {
  const { nodes, editor: me, repo, reload, toast } = useNeathub()
  const [users, setUsers] = useState<HubUser[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [role, setRole] = useState<'all' | Role>('all')
  const [tote, setTote] = useState('')
  const [sort, setSort] = useState<Sort>('smart')
  const hubs = useMemo(() => nodes.filter((n) => !n.parentId && n.type === 'hub'), [nodes])
  const grants = useMemo(() => [{ id: HOME, title: 'דף הבית', home: true }, ...hubs.map((h) => ({ id: h.id, title: h.title, home: false }))], [hubs])

  const load = useCallback(() => repo.users().then(setUsers, () => setErr('אין גישה לרשימת המשתמשים.')), [repo])
  useEffect(() => { void load() }, [load])

  async function update(u: HubUser, scopes: string[]) {
    try {
      await repo.setScopes(u.uid, scopes)
      await Promise.all([load(), reload()])
      toast('עודכן')
    } catch {
      toast('העדכון נכשל')
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: users?.length || 0 }
    for (const u of users || []) c[u.role] = (c[u.role] || 0) + 1
    return c
  }, [users])

  const shown = useMemo(() => {
    if (!users) return []
    const words = norm(q).split(' ').filter(Boolean)
    const list = users.filter((u) => {
      if (role !== 'all' && u.role !== role) return false
      if (role === 'lead' && tote && !(u.scopes || []).includes(tote)) return false
      if (!words.length) return true
      const hay = norm(`${u.name || ''} ${u.email || ''} ${ROLE_LABEL[u.role] || ''}`)
      return words.every((w) => hay.includes(w))
    })
    const cmp = ({
      smart: (a: HubUser, b: HubUser) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || byName(a, b),
      name: byName,
      new: (a: HubUser, b: HubUser) => time(b.createdAt) - time(a.createdAt) || byName(a, b),
      role: (a: HubUser, b: HubUser) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || byName(a, b),
    } satisfies Record<Sort, (a: HubUser, b: HubUser) => number>)[sort]
    return list.sort(cmp)
  }, [users, q, role, tote, sort])

  if (err) return <p className="empty">{err}</p>
  if (!users) return <p className="empty">טוען…</p>

  const filtered = q || role !== 'all'
  const clear = () => { setQ(''); setRole('all'); setTote('') }

  return (
    <div className="admin">
      <h2>מי עורך מה</h2>
      <p className="muted">
        מנטורים עורכים הכול. ראש צוות עורך רק את מה שסומן לו כאן: ארגז = הארגז וכל מה שבתוכו (כולל העונה);
        דף הבית = הוספת פריטים לדף הבית ועריכת הקישורים שעליו. ארגז חדש שראש צוות יוצר נוסף לו אוטומטית, ואפשר להוריד אותו.
      </p>
      <p className="muted">
        התפקיד מגיע מ-NeatSystem: מנטורים ואדמינים הם "מנטור" כאן; רש"צים וקפטנים — "ראש צוות". אפשר לתת לכל אחד את ההרשאה
        "עריכת ארגזים ב-NEATHUB" מהפרופיל שלו ב-NeatSystem.
      </p>

      <div className="ufilters">
        <label className="usearch">
          <Search size={18} aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש לפי שם או מייל"
            aria-label="חיפוש משתמשים"
          />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="מיון">
          {SORTS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
      </div>

      <div className="rolechips" role="group" aria-label="סינון לפי תפקיד">
        {ROLE_FILTERS.map(([k, t]) => (
          <button
            key={k}
            type="button"
            className={`rchip ${role === k ? 'on' : ''}`}
            aria-pressed={role === k}
            onClick={() => { setRole(k); if (k !== 'lead') setTote('') }}
          >
            {t} <span className="n">{counts[k] || 0}</span>
          </button>
        ))}
        {role === 'lead' && (
          <select value={tote} onChange={(e) => setTote(e.target.value)} aria-label="ראשי צוותים עם הרשאה ל…">
            <option value="">כל ההרשאות</option>
            {grants.map((h) => <option key={h.id} value={h.id}>{h.title}</option>)}
          </select>
        )}
      </div>

      <p className="muted ucount">
        {filtered ? `${shown.length} מתוך ${users.length} משתמשים` : `${users.length} משתמשים`}
        {filtered && <button type="button" className="linkish" onClick={clear}>ניקוי סינון</button>}
      </p>

      {!shown.length && <p className="empty">אין משתמשים שמתאימים לסינון.</p>}

      <ul className="users">
        {shown.map((u) => {
          return (
            <li key={u.uid}>
              <div className="who">
                {u.photo ? <img src={u.photo} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{(u.name || u.email || '?')[0]}</span>}
                <div>
                  <b>{u.name || '—'}{u.uid === me.uid ? ' (את/ה)' : ''}</b>
                  {u.email && <span dir="ltr">{u.email}</span>}
                </div>
              </div>
              <span className={`rolepill ${u.role}`}>{ROLE_LABEL[u.role] ?? u.role}</span>
              {u.role === 'lead' && (
                <div className="scopes">
                  {grants.map((h) => {
                    const on = (u.scopes || []).includes(h.id)
                    return (
                      <label key={h.id} className={`scope ${on ? 'on' : ''} ${h.home ? 'home' : ''}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => update(u, on ? u.scopes.filter((s) => s !== h.id) : [...u.scopes, h.id])}
                        />
                        {h.home && <House size={16} aria-hidden />}
                        {h.title}
                      </label>
                    )
                  })}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
