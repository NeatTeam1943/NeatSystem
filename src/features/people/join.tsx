import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { api, type Person, type Position } from '@/core/api'
import { invalidate } from '@/core/data'
import { currentGradYears, gradeLabel, gradeOf, POSITION_LABEL, positionText, teamName } from '@/core/labels'
import { fmtAgo } from '@/core/format'
import type { InboxItem } from '@/core/feature'
import type { Session } from '@/core/session'
import { useSession } from '@/core/session'
import { Button, Field, Select, Sheet, Switch, Textarea, useRun } from '@/ui'

/** "לטיפולי" source: join requests, for people with users.approve */
export function useJoinInbox(s: Session): InboxItem[] {
  if (!s.can('users.approve')) return []
  return s.people
    .filter((p) => p.status === 'pending')
    .map((p) => ({
      id: `join:${p.id}`,
      kind: 'join',
      kindLabel: 'הצטרפות',
      icon: UserPlus,
      title: <>בקשת הצטרפות: <b>{p.full_name}</b></>,
      meta: [p.match_profile && `נראה כמו: ${s.people.find((x) => x.id === p.match_profile)?.full_name ?? 'פרופיל קיים'}`, p.requested_team && `רוצה להצטרף ל${teamName(s.teams, p.requested_team)}`, gradeOf(p.grad_year) && `כיתה ${gradeLabel(gradeOf(p.grad_year))}`, fmtAgo(p.created_at)].filter(Boolean).join(' · '),
      at: p.created_at,
      urgent: Date.now() - new Date(p.created_at).getTime() > 3 * 864e5,
      Actions: ({ done }) => <JoinActions p={p} done={done} />,
    }))
}

function JoinActions({ p, done }: { p: Person; done: () => void }) {
  const [open, setOpen] = useState<null | 'approve' | 'reject'>(null)
  return (
    <>
      <Button size="sm" onClick={() => setOpen('reject')}>דחייה</Button>
      <Button size="sm" variant="white" onClick={() => setOpen('approve')}>שיוך ואישור…</Button>
      {open === 'approve' && <ApproveSheet p={p} onClose={() => setOpen(null)} done={done} />}
      {open === 'reject' && <RejectSheet p={p} onClose={() => setOpen(null)} done={done} />}
    </>
  )
}

function ApproveSheet({ p, onClose, done }: { p: Person; onClose: () => void; done: () => void }) {
  const s = useSession()
  const run = useRun()
  const [team, setTeam] = useState(p.requested_team ?? '')
  const [pos, setPos] = useState<Position>('member')
  const [year, setYear] = useState(p.grad_year ?? 0)
  const [busy, setBusy] = useState(false)
  const canRole = s.can('users.edit_membership')
  const match = p.match_profile ? s.people.find((x) => x.id === p.match_profile && x.invited) ?? null : null
  const [link, setLink] = useState(!!match)
  const approve = async () => {
    setBusy(true)
    const ok = await run(() => api.decideJoin({ user: p.id, approve: true, team: team || null, position: pos, grad_year: year || null, link }), link && match ? `${match.full_name} התחבר/ה לפרופיל שלו/ה` : `${p.full_name} צורף/ה לקבוצה`)
    setBusy(false)
    if (ok) { done(); onClose(); invalidate() }
  }
  return (
    <Sheet title={`צירוף ${p.full_name}`} sub="בקשת הצטרפות" onClose={onClose}
      footer={<><Button onClick={onClose}>ביטול</Button><Button variant="primary" busy={busy} onClick={approve}>אישור וצירוף</Button></>}>
      <div className="stack">
        {p.join_note && <div className="banner info">"{p.join_note}"</div>}
        <dl className="kv">
          <dt>מייל</dt><dd dir="ltr" style={{ textAlign: 'end' }}>{p.email ?? '—'}</dd>
          <dt>טלפון</dt><dd dir="ltr" style={{ textAlign: 'end' }}>{p.phone ?? '—'}</dd>
        </dl>
        {match && (
          <div className="row" style={{ padding: '4px 2px' }}>
            <div className="grow"><div className="w7">זה/זו {match.full_name}</div><div className="foot c2">{[positionText(match, s.teams), match.phone].filter(Boolean).join(' · ')}</div></div>
            <Switch on={link} onChange={setLink} label={`חיבור לפרופיל של ${match.full_name}`} />
          </div>
        )}
        {!(link && match) && <div className="formgrid two">
          <Field label="צוות">{(id) => (
            <Select id={id} value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">בלי צוות</option>
              {s.teams.filter((t) => t.kind === 'team').map((t) => <option key={t.id} value={t.id}>{t.name}{t.id === p.requested_team ? ' (ביקש/ה)' : ''}</option>)}
            </Select>
          )}</Field>
          <Field label="תפקיד" hint={canRole ? undefined : 'רק מי שעורך חברות יכול לקבוע תפקיד אחר'}>{(id) => (
            <Select id={id} value={pos} disabled={!canRole} onChange={(e) => setPos(e.target.value as Position)}>
              {(['member', 'team_lead', 'captain', ...(s.can('users.grant_permissions') ? ['mentor'] : [])] as Position[]).map((x) => <option key={x} value={x}>{POSITION_LABEL[x]}</option>)}
            </Select>
          )}</Field>
          <Field label="שנתון">{(id) => (
            <Select id={id} value={year} onChange={(e) => setYear(Number(e.target.value))}>
              <option value={0}>—</option>
              {currentGradYears().map((y) => <option key={y.year} value={y.year}>{y.year} · כיתה {gradeLabel(y.grade)}</option>)}
            </Select>
          )}</Field>
        </div>}
      </div>
    </Sheet>
  )
}

function RejectSheet({ p, onClose, done }: { p: Person; onClose: () => void; done: () => void }) {
  const run = useRun()
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const reject = async () => {
    setBusy(true)
    const ok = await run(() => api.decideJoin({ user: p.id, approve: false, reason: why || null }), 'הבקשה נדחתה')
    setBusy(false)
    if (ok) { done(); onClose(); invalidate() }
  }
  return (
    <Sheet title={`לדחות את ${p.full_name}?`} onClose={onClose}
      footer={<><Button onClick={onClose}>ביטול</Button><Button variant="danger" busy={busy} onClick={reject}>דחייה</Button></>}>
      <Field label="סיבה (נשמרת ביומן, לא נשלחת)">{(id) => <Textarea id={id} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="למשל: לא מהקבוצה" />}</Field>
      <p className="foot c2" style={{ marginTop: 10 }}>אם זו טעות, הם יכולים לבקש שוב.</p>
    </Sheet>
  )
}
