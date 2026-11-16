import { useState } from 'react'
import { Clock3, LogOut } from 'lucide-react'
import { api, type Person, type SessionUser } from '@/core/api'
import { invalidate } from '@/core/data'
import { currentGradYears, gradeLabel, teamName } from '@/core/labels'
import { fmtAgo } from '@/core/format'
import { useSession } from '@/core/session'
import { Button, Field, Input, Select, Textarea, useRun } from '@/ui'

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="gate">
      <div className="gatecard page">
        <div className="brandmark" style={{ width: 60, height: 60, fontSize: 28, margin: '0 auto 14px' }} aria-hidden>N</div>
        {children}
      </div>
    </div>
  )
}

const Google = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
)

export function Login() {
  const run = useRun()
  return (
    <Frame>
      <h1 className="h1" style={{ textAlign: 'center' }}>NeatHub</h1>
      <p className="c2" style={{ textAlign: 'center', margin: '6px 0 22px' }}>המערכת של Neat Team 1943</p>
      <Button variant="white" size="lg" block onClick={() => run(() => api.signInWithGoogle())}><Google />כניסה עם Google</Button>
      <p className="foot cm" style={{ textAlign: 'center', marginTop: 14 }}>אותו חשבון כמו ב-MoneyTeam. מי שמחובר באחד, מחובר גם בשני.</p>
    </Frame>
  )
}

export function Onboarding({ user, previous }: { user: SessionUser; previous: Person | null }) {
  const s = useSession()
  const run = useRun()
  const [f, setF] = useState({
    full_name: previous?.full_name ?? user.name ?? '', phone: previous?.phone ?? '', birth_date: previous?.birth_date ?? '',
    grad_year: previous?.grad_year ?? 0, team: previous?.requested_team ?? '', note: '',
  })
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)
  const errs = {
    full_name: f.full_name.trim().length < 2 ? 'צריך שם מלא' : null,
    phone: f.phone.trim() && !/^[0-9+\- ]{7,20}$/.test(f.phone.trim()) ? 'רק ספרות, רווחים ומקפים' : null,
  }
  const send = async () => {
    setTried(true)
    if (errs.full_name || errs.phone) return
    setBusy(true)
    const ok = await run(() => api.requestJoin({ full_name: f.full_name.trim(), phone: f.phone.trim() || null, birth_date: f.birth_date || null, grad_year: f.grad_year || null, team: f.team || null, note: f.note.trim() || null }))
    setBusy(false)
    if (ok) invalidate()
  }
  return (
    <Frame>
      <h1 className="h2" style={{ textAlign: 'center' }}>{previous ? 'לבקש שוב להצטרף' : 'ברוכים הבאים!'}</h1>
      <p className="c2" style={{ textAlign: 'center', margin: '6px 0 20px' }}>
        {previous ? 'הבקשה הקודמת נדחתה. אפשר לעדכן פרטים ולשלוח שוב.' : 'כמה פרטים, ומנטור יאשר את ההצטרפות.'}
        <br /><span className="foot cm" dir="ltr">{user.email}</span>
      </p>
      <div className="formgrid">
        <Field label="שם מלא" error={tried ? errs.full_name : null}>{(id) => <Input id={id} value={f.full_name} autoComplete="name" aria-invalid={tried && !!errs.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />}</Field>
        <div className="formgrid two">
          <Field label="טלפון" error={errs.phone}>{(id) => <Input id={id} value={f.phone} inputMode="tel" dir="ltr" autoComplete="tel" aria-invalid={!!errs.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />}</Field>
          <Field label="תאריך לידה">{(id) => <Input id={id} type="date" value={f.birth_date} onChange={(e) => setF({ ...f, birth_date: e.target.value })} />}</Field>
          <Field label="כיתה">{(id) => (
            <Select id={id} value={f.grad_year} onChange={(e) => setF({ ...f, grad_year: Number(e.target.value) })}>
              <option value={0}>אני לא תלמיד/ה</option>
              {currentGradYears().map((y) => <option key={y.year} value={y.year}>כיתה {gradeLabel(y.grade)}</option>)}
            </Select>
          )}</Field>
          <Field label="צוות">{(id) => (
            <Select id={id} value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })}>
              <option value="">עוד לא יודע/ת</option>
              {s.teams.filter((t) => t.kind === 'team').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          )}</Field>
        </div>
        <Field label="משהו שכדאי שנדע? (לא חובה)">{(id) => <Textarea id={id} value={f.note} maxLength={300} onChange={(e) => setF({ ...f, note: e.target.value })} />}</Field>
      </div>
      <div className="row" style={{ marginTop: 18 }}>
        <Button variant="ghost" icon={LogOut} onClick={() => api.signOut()}>זה לא אני</Button>
        <span className="grow" />
        <Button variant="primary" size="lg" busy={busy} onClick={send}>שליחת בקשה</Button>
      </div>
    </Frame>
  )
}

export function Pending({ me }: { me: Person }) {
  const s = useSession()
  return (
    <Frame>
      <div className="empty" style={{ padding: '6px 0 0' }}>
        <div className="ic" style={{ background: 'var(--orange-dim)', color: 'var(--orange-hi)' }}><Clock3 size={26} /></div>
        <h1 className="h2" style={{ color: '#fff' }}>הבקשה נשלחה</h1>
        <p>מנטור או אדמין יאשרו אותה בקרוב. אין צורך לעשות כלום — כשתאושר/י, פשוט תיכנס/י.</p>
      </div>
      <dl className="kv" style={{ margin: '10px 0 18px' }}>
        <dt>שם</dt><dd>{me.full_name}</dd>
        {me.requested_team && <><dt>צוות</dt><dd>{teamName(s.teams, me.requested_team)}</dd></>}
        <dt>נשלחה</dt><dd>{fmtAgo(me.created_at)}</dd>
      </dl>
      <Button block variant="ghost" icon={LogOut} onClick={() => api.signOut()}>התנתקות</Button>
    </Frame>
  )
}

export function Archived({ me }: { me: Person }) {
  return (
    <Frame>
      <h1 className="h2" style={{ textAlign: 'center' }}>החשבון בארכיון</h1>
      <p className="c2" style={{ textAlign: 'center' }}>{me.full_name}, החשבון שלך הועבר לארכיון. אם זו טעות, דברו עם מנטור.</p>
      <Button block variant="ghost" icon={LogOut} onClick={() => api.signOut()}>התנתקות</Button>
    </Frame>
  )
}
