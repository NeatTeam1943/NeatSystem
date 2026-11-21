import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Cake, KeyRound, Mail, Pencil, Phone, Search, ShieldCheck, UserCog, Users, Wrench } from 'lucide-react'
import { api, type Person } from '@/core/api'
import { useData } from '@/core/data'
import { displayName, gradeLabel, gradeOf, POSITION_LABEL, positionText, STATUS_LABEL, teamName } from '@/core/labels'
import { fmtAgo, fmtDay } from '@/core/format'
import { auditText } from '@/core/auditText'
import { useSession } from '@/core/session'
import { MODULES } from '@/app/modules'
import { Avatar, Badge, Button, Card, Chips, Empty, Input, PageHead, Sheet } from '@/ui'
import { EditMyProfileSheet, ExtraPermissions, MembershipForm } from './forms'
import { ArchiveRecords, SystemBlocks } from './SystemBlocks'

type Filter = 'all' | 'cad' | 'build' | 'software' | 'leads' | 'mentors' | 'rookies'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'הכל' }, { id: 'cad', label: 'שרטוט' }, { id: 'build', label: 'בנייה' }, { id: 'software', label: 'תוכנה' },
  { id: 'leads', label: 'רש"צים וקפטנים' }, { id: 'mentors', label: 'מנטורים' }, { id: 'rookies', label: 'רוקים' },
]
const match = (p: Person, f: Filter) =>
  f === 'all' ? true
    : f === 'leads' ? p.position === 'team_lead' || p.position === 'captain'
      : f === 'mentors' ? p.position === 'mentor'
        : f === 'rookies' ? p.position === 'rookie'
          : p.team === f

export function PeoplePage() {
  const s = useSession()
  // filter + query live in the URL, so "back" from a profile restores them
  const [sp, setSp] = useSearchParams()
  const f = (sp.get('f') as Filter) || 'all'
  const q = sp.get('q') ?? ''
  const set = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); if (v && v !== 'all') n.set(k, v); else n.delete(k); return n }, { replace: true })

  const list = useMemo(() => s.people
    .filter((p) => p.status === 'active' && match(p, f))
    .filter((p) => !q.trim() || `${p.full_name} ${p.nickname ?? ''}`.includes(q.trim())), [s.people, f, q])

  // group by role: mentors first, then by grade (12 → 7)
  const groups = useMemo(() => {
    const g = new Map<string, Person[]>()
    for (const p of list) {
      const k = p.position === 'mentor' ? 'מנטורים' : gradeOf(p.grad_year) ? `כיתה ${gradeLabel(gradeOf(p.grad_year))}` : 'אחר'
      g.set(k, [...(g.get(k) ?? []), p])
    }
    const order = (k: string) => (k === 'מנטורים' ? 0 : k === 'אחר' ? 99 : 20 - (gradeOf(g.get(k)![0].grad_year) ?? 0))
    return [...g.entries()].sort((a, b) => order(a[0]) - order(b[0]))
  }, [list])

  return (
    <div className="page">
      <PageHead title="חברי הקבוצה" sub={`${s.people.filter((p) => p.status === 'active').length} פעילים`} />
      <div className="stack" style={{ marginBottom: 18 }}>
        <div style={{ position: 'relative', maxWidth: 420 }}>
          <Input aria-label="חיפוש לפי שם" placeholder="חיפוש לפי שם…" value={q} onChange={(e) => set('q', e.target.value)} style={{ paddingInlineStart: 40 }} />
          <Search size={18} className="cm" style={{ position: 'absolute', insetInlineStart: 13, top: 14 }} aria-hidden />
        </div>
        <Chips label="סינון" value={f} onChange={(v) => set('f', v)} items={FILTERS} />
      </div>
      {list.length === 0 && <Empty icon={Users} title="אין תוצאות">נסו סינון אחר</Empty>}
      {groups.map(([k, ps]) => (
        <section key={k} style={{ marginBottom: 22 }}>
          <h2 className="h3" style={{ margin: '0 2px 10px' }}>{k} <span className="cm foot w5">· {ps.length}</span></h2>
          <div className="pgrid">
            {ps.map((p) => <PersonCard key={p.id} p={p} />)}
          </div>
        </section>
      ))}
    </div>
  )
}

function PersonCard({ p }: { p: Person }) {
  const s = useSession()
  return (
    <Link to={`/people/${p.id}`} className="card click pcard">
      <Avatar name={p.full_name} src={p.avatar_url} size={50} />
      <div className="grow">
        <div className="w7" style={{ fontSize: 16 }}>{displayName(p)}{p.nickname && <span className="cm w5"> · {p.nickname}</span>}</div>
        <div className="foot c2">{positionText(p, s.teams)}</div>
        {(p.subteams.length > 0 || p.is_admin) && (
          <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>
            {p.is_admin && <Badge tone="blue">אדמין</Badge>}
            {p.subteams.map((t) => <Badge key={t}>{teamName(s.teams, t)}</Badge>)}
          </div>
        )}
      </div>
    </Link>
  )
}

export function ProfilePage() {
  const { id } = useParams()
  const s = useSession()
  const p = s.people.find((x) => x.id === id)
  const [sheet, setSheet] = useState<null | 'mine' | 'membership' | 'perms'>(null)
  const self = p?.id === s.me.id
  const canEdit = s.can('users.edit_membership') && p?.status !== 'pending'
  const canAudit = s.can('audit.view')
  const log = useData(p && canAudit ? `audit:${p.id}` : null, () => api.audit({ targetId: p!.id, limit: 20 }))

  if (!p) return <div className="page"><PageHead title="לא נמצא" back={{ fallback: '/people', label: 'חברי הקבוצה' }} /><Empty icon={Users} title="אין כאן אף אחד">ייתכן שהחשבון בארכיון או שאין לך הרשאה לראות אותו.</Empty></div>
  const grade = gradeOf(p.grad_year)
  const sections = MODULES.flatMap((m) => m.profile ?? []).filter((x) => !x.visible || x.visible(s, p)).sort((a, b) => a.order - b.order)

  return (
    <div className="page">
      <PageHead title={displayName(p)} back={{ fallback: '/people', label: 'חזרה' }}
        actions={<>
          {self && <Button icon={Pencil} onClick={() => setSheet('mine')}>עריכת הפרטים שלי</Button>}
          {canEdit && <Button icon={UserCog} variant="tint" onClick={() => setSheet('membership')}>עריכת חברות</Button>}
          {s.can('users.grant_permissions') && p.status === 'active' && <Button icon={KeyRound} variant="tint" onClick={() => setSheet('perms')}>הרשאות</Button>}
        </>} />
      {p.status !== 'active' && <div className={'banner ' + (p.status === 'archived' ? 'warn' : 'info')} style={{ marginBottom: 14 }}>{STATUS_LABEL[p.status]}{p.status === 'archived' && p.archived_at ? ` מאז ${fmtDay(p.archived_at)}${p.archive_reason ? ` · ${p.archive_reason}` : ''}. אין לו/ה גישה לאף מערכת; כל המידע נשמר.` : ''}</div>}
      <div className="grid2">
        <div className="stack">
          <Card mesh="blue" className="idcard">
            <div className="row top" style={{ gap: 16 }}>
              <Avatar name={p.full_name} src={p.avatar_url} size={86} />
              <div className="grow">
                <div className="h2">{p.full_name}</div>
                {p.nickname && <div className="c2">"{p.nickname}"</div>}
                <div className="w7" style={{ color: 'var(--reward-text)', marginTop: 4 }}>{p.position ? POSITION_LABEL[p.position] : ''}{p.team && p.position !== 'mentor' ? ` · ${teamName(s.teams, p.team)}` : ''}</div>
                <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                  {grade && <span className="badge brand">כיתה {gradeLabel(grade)}</span>}
                  {p.is_admin && <span className="badge brand"><ShieldCheck size={13} />אדמין</span>}
                  {p.subteams.map((t) => <span key={t} className="badge brand">{teamName(s.teams, t)}</span>)}
                </div>
              </div>
            </div>
          </Card>
          <Card title="פרטים">
            <dl className="kv">
              {p.phone && <><dt><Phone size={16} />טלפון</dt><dd><a href={`tel:${p.phone.replace(/[^0-9+]/g, '')}`} dir="ltr">{p.phone}</a></dd></>}
              {(p.birth_date || p.birthday) && <><dt><Cake size={16} />יום הולדת</dt><dd>{p.birth_date ? fmtDay(p.birth_date) : fmtDay(`2000-${p.birthday}`)}</dd></>}
              {p.fav_tool && <><dt><Wrench size={16} />כלי אהוב</dt><dd>{p.fav_tool}</dd></>}
              {p.email && <><dt><Mail size={16} />מייל</dt><dd dir="ltr" style={{ textAlign: 'end', overflowWrap: 'anywhere' }}>{p.email}</dd></>}
              {p.grad_year && <><dt>שנתון</dt><dd>{p.grad_year}</dd></>}
            </dl>
            {!p.phone && !self && <p className="foot cm" style={{ margin: '12px 0 0' }}>טלפון ותאריך לידה מלא מוצגים רק למי שיש לו הרשאה.</p>}
          </Card>
        </div>
        <div className="stack">
          {sections.map((x) => <x.Component key={x.id} person={p} />)}
          <SystemBlocks person={p} />
          {p.status === 'archived' && <ArchiveRecords person={p} />}
          {canAudit && (
            <Card title="פעולות אחרונות">
              {log.loading ? <div className="skel" style={{ height: 80 }} /> : (log.data ?? []).length === 0 ? <div className="foot c2">אין פעולות</div> : (
                <div className="list">
                  {log.data!.map((a) => {
                    const t = auditText(a, s.people, s.teams)
                    return (
                      <div key={a.id} className="lrow" style={{ minHeight: 0 }}>
                        <div className="main2"><div className="foot"><b>{t.who}</b> {t.what}</div>{t.details && <div className="cap cm">{t.details}</div>}</div>
                        <span className="cap cm">{fmtAgo(a.at)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
      {sheet === 'mine' && <EditMyProfileSheet me={p} onClose={() => setSheet(null)} />}
      {sheet === 'membership' && <Sheet side title="עריכת חברות" sub={p.full_name} onClose={() => setSheet(null)}><MembershipForm person={p} onDone={() => setSheet(null)} /></Sheet>}
      {sheet === 'perms' && <Sheet side title="הרשאות" sub={`${p.full_name} · ${p.position ? POSITION_LABEL[p.position] : ''}`} onClose={() => setSheet(null)}><ExtraPermissions person={p} /></Sheet>}
    </div>
  )
}
