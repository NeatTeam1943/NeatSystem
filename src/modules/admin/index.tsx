import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Blocks, History, KeyRound, Search, Settings, ShieldCheck, Users } from 'lucide-react'
import { TABS } from '@/app/tabs'
import { api, type Person, type Role } from '@/core/api'
import { invalidate, useData } from '@/core/data'
import { gradeLabel, gradeOf, POSITION_LABEL, ROLE_LABEL, ROLES, STATUS_LABEL, teamName } from '@/core/labels'
import { fmtAgo, fmtDate, fmtTime } from '@/core/format'
import { auditText } from '@/core/auditText'
import type { HubModule } from '@/core/module'
import { useSession, type Session } from '@/core/session'
import { Avatar, Badge, Button, Chips, Empty, Input, PageHead, Select, Sheet, Skeleton, Switch, Tabs, useRun } from '@/ui'
import { ExtraPermissions, MembershipForm } from '../people/forms'
import { permSections } from '@/core/permSections'

const canAdmin = (s: Session) => s.can('users.edit_membership') || s.can('users.grant_permissions') || s.can('audit.view')
type Tab = 'users' | 'perms' | 'audit' | 'systems'

function AdminPage() {
  const s = useSession()
  const { tab = 'users' } = useParams()
  const nav = useNavigate()
  const tabs = ([
    s.can('users.edit_membership') && { id: 'users', label: 'משתמשים', icon: Users },
    (s.can('users.grant_permissions') || s.can('users.edit_membership')) && { id: 'perms', label: 'טבלת הרשאות', icon: KeyRound },
    s.can('audit.view') && { id: 'audit', label: 'יומן פעולות', icon: History },
    s.can('users.grant_permissions') && { id: 'systems', label: 'מערכות', icon: Blocks },
  ].filter(Boolean)) as { id: Tab; label: string; icon: typeof Users }[]
  const cur = (tabs.find((t) => t.id === tab) ?? tabs[0])?.id
  if (!cur) return <div className="page"><PageHead title="ניהול" /><Empty icon={Settings} title="אין לך גישה לניהול" /></div>
  return (
    <div className="page">
      <PageHead title="ניהול" sub="משתמשים, הרשאות ויומן הפעולות" />
      <Tabs label="ניהול" value={cur} onChange={(t) => nav(`/admin/${t}`, { replace: true })} items={tabs} />
      {cur === 'users' && <UsersTab />}
      {cur === 'perms' && <PermsTab />}
      {cur === 'audit' && <AuditTab />}
      {cur === 'systems' && <SystemsTab />}
    </div>
  )
}

/* ---------------- users ---------------- */
type SF = 'active' | 'archived' | 'pending'
function UsersTab() {
  const s = useSession()
  const [sp, setSp] = useSearchParams()
  const status = (sp.get('s') as SF) || 'active'
  const team = sp.get('t') ?? ''
  const q = sp.get('q') ?? ''
  const set = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n }, { replace: true })
  const [sel, setSel] = useState<string | null>(null)
  const list = useMemo(() => s.people
    .filter((p) => p.status === status)
    .filter((p) => !team || (team === 'none' ? !p.team : p.team === team))
    .filter((p) => !q.trim() || `${p.full_name} ${p.nickname ?? ''} ${p.email ?? ''}`.includes(q.trim())), [s.people, status, team, q])
  const counts = { active: 0, archived: 0, pending: 0 } as Record<SF, number>
  s.people.forEach((p) => { if (p.status in counts) counts[p.status as SF]++ })
  const person = s.people.find((p) => p.id === sel) ?? null

  return (
    <>
      <div className="row wrap" style={{ gap: 10, marginBottom: 14 }}>
        <Chips label="סטטוס" value={status} onChange={(v) => set('s', v === 'active' ? '' : v)} items={[
          { id: 'active', label: `פעילים · ${counts.active}` },
          { id: 'pending', label: `ממתינים · ${counts.pending}` },
          { id: 'archived', label: `ארכיון · ${counts.archived}` },
        ]} />
        <span className="grow" />
        <Select aria-label="צוות" value={team} onChange={(e) => set('t', e.target.value)} style={{ width: 160, height: 40 }}>
          <option value="">כל הצוותים</option>
          {s.teams.filter((t) => t.kind === 'team').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          <option value="none">בלי צוות</option>
        </Select>
        <div style={{ position: 'relative', width: 'min(100%, 260px)' }}>
          <Input aria-label="חיפוש" placeholder="שם או מייל…" value={q} onChange={(e) => set('q', e.target.value)} style={{ height: 40, paddingInlineStart: 38 }} />
          <Search size={16} className="cm" style={{ position: 'absolute', insetInlineStart: 13, top: 12 }} aria-hidden />
        </div>
      </div>
      {status === 'pending' && counts.pending > 0 && <div className="banner info" style={{ marginBottom: 12 }}>בקשות הצטרפות מאשרים מ"לטיפולי". כאן רק רואים אותן.</div>}
      {list.length === 0 ? <Empty icon={Users} title="אין משתמשים כאן" /> : (
        <>
          {/* desktop: table */}
          <div className="tablewrap only-desk">
            <table className="table">
              <thead><tr><th>שם</th><th>תפקיד</th><th>צוות</th><th>כיתה</th><th>תתי-צוותים</th><th>עודכן</th></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className={sel === p.id ? 'sel' : ''} onClick={() => setSel(p.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSel(p.id)}>
                    <td><div className="row"><Avatar name={p.full_name} src={p.avatar_url} size={30} /><span className="w7">{p.full_name}</span>{p.is_admin && <Badge tone="blue">אדמין</Badge>}{p.invited && <Badge tone="warn">עוד לא התחבר/ה</Badge>}</div></td>
                    <td>{p.position ? POSITION_LABEL[p.position] : STATUS_LABEL[p.status]}</td>
                    <td>{teamName(s.teams, p.team) || <span className="cm">—</span>}</td>
                    <td className="tnum">{gradeLabel(gradeOf(p.grad_year)) || <span className="cm">—</span>}</td>
                    <td><div className="row wrap" style={{ gap: 4 }}>{p.subteams.map((t) => <Badge key={t}>{teamName(s.teams, t)}</Badge>)}</div></td>
                    <td className="cm foot">{p.decided_at ? fmtAgo(p.decided_at) : fmtAgo(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* phone: cards */}
          <div className="stack tight only-phone">
            {list.map((p) => (
              <button key={p.id} className="card click pcard" style={{ textAlign: 'start', border: 0, width: '100%' }} onClick={() => setSel(p.id)}>
                <Avatar name={p.full_name} src={p.avatar_url} size={42} />
                <span className="grow">
                  <span className="w7 row" style={{ gap: 6 }}>{p.full_name}{p.is_admin && <Badge tone="blue">אדמין</Badge>}</span>
                  <span className="foot c2" style={{ display: 'block' }}>{[p.position && POSITION_LABEL[p.position], teamName(s.teams, p.team), gradeLabel(gradeOf(p.grad_year)) && `כיתה ${gradeLabel(gradeOf(p.grad_year))}`].filter(Boolean).join(' · ')}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {person && <UserPanel p={person} onClose={() => setSel(null)} />}
    </>
  )
}

function UserPanel({ p, onClose }: { p: Person; onClose: () => void }) {
  const s = useSession()
  const nav = useNavigate()
  const [tab, setTab] = useState<'membership' | 'perms'>('membership')
  return (
    <Sheet side title={p.full_name} sub={p.email ?? undefined} onClose={onClose}>
      {s.can('users.grant_permissions') && p.status === 'active' && (
        <Tabs label="עריכה" value={tab} onChange={setTab} items={[{ id: 'membership', label: 'חברות' }, { id: 'perms', label: 'הרשאות נוספות' }]} />
      )}
      {tab === 'membership' || p.status !== 'active' ? (p.status === 'pending' ? <div className="banner info">מאשרים מ"לטיפולי".</div> : <MembershipForm person={p} onDone={onClose} />) : <ExtraPermissions person={p} />}
      <div style={{ marginTop: 18 }}><Button variant="ghost" size="sm" onClick={() => nav(`/people/${p.id}`)}>לפרופיל המלא</Button></div>
    </Sheet>
  )
}

/* ---------------- permission matrix: one page, a section per system ---------------- */
function PermsTab() {
  const s = useSession()
  const run = useRun()
  const perms = useData('admin:perms', () => api.permissions())
  const rps = useData('admin:roleperms', () => api.rolePermissions())
  const [role, setRole] = useState<Role>('team_lead')
  const editable = s.can('users.grant_permissions')
  if (perms.loading || rps.loading) return <Skeleton n={5} />
  const on = (r: Role, k: string) => (rps.data ?? []).some((x) => x.role === r && x.perm === k)
  const locked = (r: Role, k: string) => r === 'mentor' && k === 'users.grant_permissions'
  const toggle = async (r: Role, k: string, v: boolean) => {
    if (await run(() => api.setRolePermission(r, k, v), `${ROLE_LABEL[r]}: ${v ? 'נוספה' : 'הוסרה'} הרשאה`)) invalidate()
  }
  const sections = permSections(perms.data ?? [])
  return (
    <>
      {!editable && <div className="banner info" style={{ marginBottom: 14 }}>רק מנטורים משנים את הטבלה.</div>}
      <div className="only-phone" style={{ marginBottom: 12 }}>
        <Chips label="תפקיד" value={role} onChange={setRole} items={ROLES.map((r) => ({ id: r, label: ROLE_LABEL[r] }))} />
      </div>
      {sections.map((sec) => (
        <section key={sec.module} style={{ marginBottom: 22 }}>
          <h2 className="h3 row" style={{ margin: '0 2px 10px' }}><sec.icon size={18} aria-hidden />{sec.label}</h2>
          {/* desktop matrix */}
          <div className="tablewrap only-desk">
            <table className="table matrix" style={{ tableLayout: 'fixed' }}>
              <colgroup><col style={{ width: '38%' }} />{ROLES.map((r) => <col key={r} />)}</colgroup>
              <thead><tr><th>הרשאה</th>{ROLES.map((r) => <th key={r} style={{ textAlign: 'center' }}>{ROLE_LABEL[r]}</th>)}</tr></thead>
              <tbody>
                {sec.perms.map((p) => (
                  <tr key={p.key}>
                    <td><div className="w5">{p.label}</div><div className="cap cm" dir="ltr" style={{ textAlign: 'end' }}>{p.key}</div></td>
                    {ROLES.map((r) => <td key={r} style={{ textAlign: 'center' }}><Switch label={`${ROLE_LABEL[r]} · ${p.label}`} on={on(r, p.key)} disabled={!editable || locked(r, p.key)} onChange={(v) => toggle(r, p.key, v)} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* phone: one role at a time */}
          <div className="only-phone card">
            <div className="list">
              {sec.perms.map((p) => (
                <div key={p.key} className="lrow">
                  <div className="main2"><div className="ttl">{p.label}</div></div>
                  <Switch label={p.label} on={on(role, p.key)} disabled={!editable || locked(role, p.key)} onChange={(v) => toggle(role, p.key, v)} />
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
    </>
  )
}

/* ---------------- audit ---------------- */
function AuditTab() {
  const s = useSession()
  const log = useData('audit:all', () => api.audit({ limit: 200 }))
  const perms = useData('admin:perms', () => api.permissions())
  const permLabel = (k: string) => perms.data?.find((p) => p.key === k)?.label ?? k
  if (log.loading) return <Skeleton n={6} h={52} />
  const rows = log.data ?? []
  if (!rows.length) return <Empty icon={History} title="היומן ריק" />
  let lastDay = ''
  return (
    <div className="card" style={{ padding: 8 }}>
      <div className="list">
        {rows.map((a) => {
          const day = fmtDate(a.at)
          const head = day !== lastDay ? (lastDay = day) : null
          const t = auditText(a, s.people, s.teams, permLabel)
          return (
            <div key={a.id}>
              {head && <div className="w7 foot cr" style={{ padding: '12px 8px 4px' }}>{head}</div>}
              <div className="lrow" style={{ alignItems: 'flex-start' }}>
                <ShieldCheck size={18} className="cb" style={{ marginTop: 2 }} aria-hidden />
                <div className="main2">
                  <div style={{ fontSize: 15 }}><b>{t.who}</b> {t.what}{t.target && <> · <b>{t.target}</b></>}</div>
                  {t.details && <div className="meta">{t.details}</div>}
                </div>
                <span className="cap cm tnum">{fmtTime(a.at)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------------- systems (submodules) ---------------- */
function SystemsTab() {
  return (
    <div className="stack">
      <div className="card" style={{ padding: 8 }}>
        <div className="list">
          {TABS.tabs.map(({ folder, tab }) => {
            const I = tab.icon ?? Blocks
            return (
              <div key={folder} className="lrow">
                <span className="sysic"><I size={18} aria-hidden /></span>
                <div className="main2"><div className="ttl">{tab.label}</div><div className="meta" dir="ltr" style={{ textAlign: 'end' }}>systems/{folder} · /{tab.id}{tab.profile ? ` · ${tab.profile.schema}.${tab.profile.fn}` : ''}</div></div>
                <Badge tone="ok">פעיל</Badge>
              </div>
            )
          })}
          <div className="lrow">
            <span className="sysic"><Blocks size={18} aria-hidden /></span>
            <div className="main2"><div className="ttl">MoneyTeam</div><div className="meta">אתר ופרויקט נפרדים, מוצג בתוך הטאב בלי שינוי</div></div>
            <Badge>חיצוני</Badge>
          </div>
        </div>
      </div>
      {TABS.problems.map((p) => (
        <div key={p.folder} className="banner bad"><AlertTriangle size={18} aria-hidden /><span><b dir="ltr">systems/{p.folder}</b> לא נטען: {p.problem}</span></div>
      ))}
      {TABS.tabs.length === 0 && TABS.problems.length === 0 && <div className="banner info">אין עדיין מערכות. מוסיפים עם scripts/add-systems.sh (ראו README).</div>}
    </div>
  )
}

export const adminModule: HubModule = {
  id: 'admin',
  nav: [{ to: '/admin', label: 'ניהול', icon: Settings, order: 90, visible: canAdmin }],
  routes: [
    { path: 'admin', element: <AdminPage /> },
    { path: 'admin/:tab', element: <AdminPage /> },
  ],
}
