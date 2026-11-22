import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Permission, type Person, type Position } from '@/core/api'
import { permSections } from '@/core/permSections'
import { useFeatures } from '@/core/feature'
import { invalidate } from '@/core/data'
import { currentGradYears, gradeLabel, gradeOf, POSITION_LABEL, POSITIONS } from '@/core/labels'
import { useSession } from '@/core/session'
import { Button, Field, Input, Select, Sheet, Switch, useRun } from '@/ui'

const phoneOk = (p: string) => !p.trim() || /^[0-9+\- ]{7,20}$/.test(p.trim())

/** The person edits their own details. */
export function EditMyProfileSheet({ me, onClose }: { me: Person; onClose: () => void }) {
  const run = useRun()
  const [f, setF] = useState({ nickname: me.nickname ?? '', phone: me.phone ?? '', birth_date: me.birth_date ?? '', fav_tool: me.fav_tool ?? '' })
  const [busy, setBusy] = useState(false)
  const bad = !phoneOk(f.phone)
  const save = async () => {
    setBusy(true)
    const ok = await run(() => api.updateMyProfile({ nickname: f.nickname || null, phone: f.phone || null, birth_date: f.birth_date || null, fav_tool: f.fav_tool || null }), 'הפרטים נשמרו')
    setBusy(false)
    if (ok) { invalidate(); onClose() }
  }
  return (
    <Sheet title="עריכת הפרטים שלי" onClose={onClose} footer={<><Button onClick={onClose}>ביטול</Button><Button variant="primary" busy={busy} disabled={bad} onClick={save}>שמירה</Button></>}>
      <div className="formgrid two">
        <Field label="כינוי" hint="מופיע ליד השם">{(id) => <Input id={id} value={f.nickname} maxLength={30} onChange={(e) => setF({ ...f, nickname: e.target.value })} />}</Field>
        <Field label="טלפון" error={bad ? 'רק ספרות, רווחים ומקפים' : null} hint="רואים אותו רק רש״צים, קפטנים ומנטורים">
          {(id) => <Input id={id} value={f.phone} inputMode="tel" dir="ltr" aria-invalid={bad} onChange={(e) => setF({ ...f, phone: e.target.value })} />}
        </Field>
        <Field label="תאריך לידה" hint="לכולם מוצג רק היום והחודש">{(id) => <Input id={id} type="date" value={f.birth_date} onChange={(e) => setF({ ...f, birth_date: e.target.value })} />}</Field>
        <Field label="כלי אהוב">{(id) => <Input id={id} value={f.fav_tool} maxLength={40} onChange={(e) => setF({ ...f, fav_tool: e.target.value })} />}</Field>
      </div>
      <p className="foot cm" style={{ marginTop: 14 }}>שם, צוות, תפקיד ושנתון משנים מנטורים או אדמינים.</p>
    </Sheet>
  )
}

const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim())

/** Add someone ahead of time, by the email they'll sign in with. */
export function InviteSheet({ onClose }: { onClose: () => void }) {
  const s = useSession()
  const run = useRun()
  const nav = useNavigate()
  const canGrant = s.can('users.grant_permissions')
  const [f, setF] = useState({ email: '', full_name: '', team: '', position: 'member' as Position, grad_year: 0, phone: '', subteams: [] as string[] })
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)
  const errs = {
    email: !emailOk(f.email) ? 'מייל לא תקין' : null,
    full_name: f.full_name.trim().length < 2 ? 'צריך שם מלא' : null,
    phone: !phoneOk(f.phone) ? 'רק ספרות, רווחים ומקפים' : null,
  }
  const save = async () => {
    setTried(true)
    if (errs.email || errs.full_name || errs.phone) return
    setBusy(true)
    let id = ''
    const ok = await run(async () => {
      id = await api.inviteMember({ email: f.email.trim(), full_name: f.full_name.trim(), team: f.team || null, position: f.position, grad_year: f.grad_year || null, phone: f.phone.trim() || null, subteams: f.subteams })
    }, `${f.full_name.trim()} נוסף/ה`)
    setBusy(false)
    if (ok) { invalidate(); onClose(); if (id) nav(`/people/${id}`) }
  }
  return (
    <Sheet title="הוספת חבר/ה" onClose={onClose} footer={<><Button onClick={onClose}>ביטול</Button><Button variant="primary" busy={busy} onClick={save}>הוספה</Button></>}>
      <div className="stack">
        <div className="formgrid two">
          <Field label="מייל (של Google)" error={tried ? errs.email : null}>{(id) => <Input id={id} value={f.email} dir="ltr" inputMode="email" autoComplete="off" aria-invalid={tried && !!errs.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
          <Field label="שם מלא" error={tried ? errs.full_name : null}>{(id) => <Input id={id} value={f.full_name} aria-invalid={tried && !!errs.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />}</Field>
          <Field label="צוות">{(id) => (
            <Select id={id} value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })}>
              <option value="">בלי צוות</option>
              {s.teams.filter((t) => t.kind === 'team').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          )}</Field>
          <Field label="תפקיד">{(id) => (
            <Select id={id} value={f.position} onChange={(e) => setF({ ...f, position: e.target.value as Position })}>
              {POSITIONS.filter((p) => p !== 'mentor' || canGrant).map((p) => <option key={p} value={p}>{POSITION_LABEL[p]}</option>)}
            </Select>
          )}</Field>
          <Field label="כיתה">{(id) => (
            <Select id={id} value={f.grad_year} onChange={(e) => setF({ ...f, grad_year: Number(e.target.value) })}>
              <option value={0}>—</option>
              {currentGradYears().map((y) => <option key={y.year} value={y.year}>כיתה {gradeLabel(y.grade)}</option>)}
            </Select>
          )}</Field>
          <Field label="טלפון" error={errs.phone}>{(id) => <Input id={id} value={f.phone} inputMode="tel" dir="ltr" aria-invalid={!!errs.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />}</Field>
        </div>
        <SubteamChips value={f.subteams} onChange={(v) => setF({ ...f, subteams: v })} />
      </div>
    </Sheet>
  )
}

function SubteamChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const s = useSession()
  return (
    <div className="field">
      <span className="lbl">תתי-צוותים</span>
      <div className="chips">
        {s.teams.filter((t) => t.kind === 'subteam').map((t) => {
          const on = value.includes(t.id)
          return <button key={t.id} type="button" role="checkbox" aria-checked={on} className={'chip' + (on ? ' on' : '')} onClick={() => onChange(on ? value.filter((x) => x !== t.id) : [...value, t.id])}>{t.name}</button>
        })}
      </div>
    </div>
  )
}

/** Email / phone / birth date of someone who hasn't signed in yet (after that, only they edit these). */
function InviteContact({ person }: { person: Person }) {
  const run = useRun()
  const [f, setF] = useState({ email: person.email ?? '', phone: person.phone ?? '', birth_date: person.birth_date ?? '' })
  const [busy, setBusy] = useState(false)
  const dirty = f.email !== (person.email ?? '') || f.phone !== (person.phone ?? '') || f.birth_date !== (person.birth_date ?? '')
  const bad = (!!f.email.trim() && !emailOk(f.email)) || !phoneOk(f.phone)
  const save = async () => {
    setBusy(true)
    const ok = await run(() => api.updateInvite(person.id, f.email.trim(), f.phone.trim() || null, f.birth_date || null), 'נשמר')
    setBusy(false)
    if (ok) invalidate()
  }
  return (
    <div className="stack">
      <div className="formgrid two">
        <Field label="מייל (של Google)" error={f.email.trim() && !emailOk(f.email) ? 'מייל לא תקין' : null}>{(id) => <Input id={id} value={f.email} dir="ltr" inputMode="email" onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
        <Field label="טלפון" error={!phoneOk(f.phone) ? 'רק ספרות, רווחים ומקפים' : null}>{(id) => <Input id={id} value={f.phone} dir="ltr" inputMode="tel" onChange={(e) => setF({ ...f, phone: e.target.value })} />}</Field>
        <Field label="תאריך לידה">{(id) => <Input id={id} type="date" value={f.birth_date} onChange={(e) => setF({ ...f, birth_date: e.target.value })} />}</Field>
      </div>
      <div className="row"><span className="grow" /><Button disabled={!dirty || bad} busy={busy} onClick={save}>שמירת פרטי קשר</Button></div>
    </div>
  )
}

/** Membership editor — used from the profile page and from the admin users table. */
export function MembershipForm({ person, onDone }: { person: Person; onDone?: () => void }) {
  const s = useSession()
  const run = useRun()
  const canGrant = s.can('users.grant_permissions')
  const self = person.id === s.me.id
  const mentorLocked = person.position === 'mentor' && !canGrant
  const [f, setF] = useState({
    full_name: person.full_name, team: person.team ?? '', subteams: person.subteams, position: person.position ?? 'member',
    grad_year: person.grad_year ?? 0, is_admin: person.is_admin,
  })
  const [busy, setBusy] = useState(false)
  const teams = s.teams.filter((t) => t.kind === 'team')
  const years = currentGradYears()
  const grade = gradeOf(f.grad_year || null)
  const dirty = f.full_name !== person.full_name || f.team !== (person.team ?? '') || f.subteams.join() !== person.subteams.join()
    || f.position !== person.position || f.grad_year !== (person.grad_year ?? 0) || f.is_admin !== person.is_admin

  const save = async () => {
    setBusy(true)
    const ok = await run(() => api.updateMembership({
      user: person.id,
      full_name: f.full_name !== person.full_name ? f.full_name : undefined,
      team: f.team || undefined,
      clear_team: !f.team && !!person.team,
      subteams: f.subteams.join() !== person.subteams.join() ? f.subteams : undefined,
      position: !self && f.position !== person.position ? (f.position as Position) : undefined,
      grad_year: f.grad_year && f.grad_year !== person.grad_year ? f.grad_year : undefined,
      is_admin: !self && canGrant && f.is_admin !== person.is_admin ? f.is_admin : undefined,
    }), 'נשמר')
    setBusy(false)
    if (ok) { invalidate(); onDone?.() }
  }
  const [leaving, setLeaving] = useState(false)
  const restore = async () => {
    setBusy(true)
    const ok = await run(() => api.restoreMember(person.id), `${person.full_name} הוחזר/ה לפעילות`)
    setBusy(false)
    if (ok) { invalidate(); onDone?.() }
  }

  if (mentorLocked) return <div className="banner info">רק מי שמחלק הרשאות יכול לערוך מנטורים.</div>
  return (
    <div className="stack">
      {person.invited && <><InviteContact person={person} /><div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} /></>}
      <div className="formgrid two">
        <Field label="שם מלא">{(id) => <Input id={id} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />}</Field>
        <Field label="צוות">{(id) => (
          <Select id={id} value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })}>
            <option value="">בלי צוות (מנטורים)</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        )}</Field>
        <Field label="תפקיד" hint={self ? 'אי אפשר לשנות לעצמך' : undefined}>{(id) => (
          <Select id={id} value={f.position} disabled={self} onChange={(e) => setF({ ...f, position: e.target.value as Position })}>
            {POSITIONS.filter((p) => p !== 'mentor' || canGrant || person.position === 'mentor').map((p) => <option key={p} value={p}>{POSITION_LABEL[p]}</option>)}
          </Select>
        )}</Field>
        <Field label="שנתון (שנת סיום)" hint={grade ? `כיתה ${gradeLabel(grade)} השנה` : undefined}>{(id) => (
          <Select id={id} value={f.grad_year} onChange={(e) => setF({ ...f, grad_year: Number(e.target.value) })}>
            <option value={0}>—</option>
            {years.map((y) => <option key={y.year} value={y.year}>{y.year} · כיתה {gradeLabel(y.grade)}</option>)}
            {f.grad_year && !years.some((y) => y.year === f.grad_year) ? <option value={f.grad_year}>{f.grad_year}</option> : null}
          </Select>
        )}</Field>
      </div>
      <SubteamChips value={f.subteams} onChange={(v) => setF({ ...f, subteams: v })} />
      {canGrant && (
        <div className="row" style={{ padding: '4px 2px' }}>
          <div className="grow"><div className="w7">אדמין</div><div className="foot c2">מקבל/ת את הרשאות עמודת "אדמין" בטבלת ההרשאות</div></div>
          <Switch on={f.is_admin} disabled={self} onChange={(v) => setF({ ...f, is_admin: v })} label="אדמין" />
        </div>
      )}
      <div className="row wrap" style={{ marginTop: 4 }}>
        {!self && (person.status === 'archived'
          ? <Button size="sm" onClick={restore} busy={busy}>החזרה לפעילות</Button>
          : <Button size="sm" variant="danger" onClick={() => setLeaving(true)} busy={busy}>הוצאה מהקבוצה…</Button>)}
        <span className="grow" />
        <Button variant="primary" disabled={!dirty || !f.full_name.trim()} busy={busy} onClick={save}>שמירה</Button>
      </div>
      {leaving && <ArchiveSheet person={person} onClose={() => setLeaving(false)} onDone={() => { setLeaving(false); onDone?.() }} />}
    </div>
  )
}

const REASONS = ['סיים/ה י״ב', 'עזב/ה את הקבוצה', 'עבר/ה לבית ספר אחר', 'מנטור/ית שסיים/ה']

/** Leaving the team: nothing is deleted, access to every system stops at once. */
export function ArchiveSheet({ person, onClose, onDone }: { person: Person; onClose: () => void; onDone: () => void }) {
  const run = useRun()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    const ok = await run(() => api.archiveMember(person.id, reason.trim() || null), `${person.full_name} הועבר/ה לארכיון`)
    setBusy(false)
    if (ok) { invalidate(); onDone() }
  }
  return (
    <Sheet title={`הוצאת ${person.full_name} מהקבוצה`} onClose={onClose}
      footer={<><Button onClick={onClose}>ביטול</Button><Button variant="danger" busy={busy} onClick={go}>העברה לארכיון</Button></>}>
      <div className="stack">
        <ul className="bul c2">
          <li>הגישה לכל המערכות (NeatSystem, הכשרות, NeatHub ושאר הטאבים) נחסמת מיד.</li>
          <li>שום דבר לא נמחק: הפרופיל, ההסמכות, הדרגות וההיסטוריה נשארים בכל מערכת.</li>
          <li>נשמרת רשומת ארכיון עם כל מה שהופיע בפרופיל ברגע הזה, גם אם מערכת תשתנה בהמשך.</li>
          <li>אפשר להחזיר לפעילות בכל רגע.</li>
        </ul>
        <Field label="סיבה (לא חובה)">{(id) => <Input id={id} value={reason} maxLength={300} list="archive-reasons" onChange={(e) => setReason(e.target.value)} />}</Field>
        <datalist id="archive-reasons">{REASONS.map((r) => <option key={r} value={r} />)}</datalist>
      </div>
    </Sheet>
  )
}

/** Extra permissions on top of the person's role. */
export function ExtraPermissions({ person }: { person: Person }) {
  const s = useSession()
  const features = useFeatures()
  const run = useRun()
  const [all, setAll] = useState<Permission[] | null>(null)
  const [extras, setExtras] = useState<Set<string>>(new Set())
  const [fromRole, setFromRole] = useState<Set<string>>(new Set())
  const load = useCallback(async () => {
    const [perms, ups, rps] = await Promise.all([api.permissions(), api.userPermissions(), api.rolePermissions()])
    setAll(perms)
    setExtras(new Set(ups.filter((u) => u.user_id === person.id).map((u) => u.perm)))
    setFromRole(new Set(rps.filter((r) => r.role === person.position || (person.is_admin && r.role === 'admin')).map((r) => r.perm)))
  }, [person.id, person.position, person.is_admin])
  useEffect(() => { void load() }, [load])
  if (all === null) return <div className="skel" style={{ height: 120 }} />
  const canGrant = s.can('users.grant_permissions')
  return (
    <div className="stack">
      {permSections(all, features).map((sec) => (
        <div key={sec.module}>
          <div className="w7 cr foot row" style={{ margin: '4px 4px 6px' }}><sec.icon size={15} aria-hidden />{sec.label}</div>
          <div className="list">
            {sec.perms.map((p) => {
              const role = fromRole.has(p.key)
              const on = role || extras.has(p.key)
              return (
                <div key={p.key} className="lrow">
                  <div className="main2"><div className="ttl">{p.label}</div><div className="meta">{role ? 'מגיע מהתפקיד' : extras.has(p.key) ? 'הרשאה נוספת' : ''}</div></div>
                  <Switch on={on} disabled={role || !canGrant || person.status !== 'active'} label={p.label}
                    onChange={async (v) => { if (await run(() => api.setUserPermission(person.id, p.key, v), v ? 'ההרשאה נוספה' : 'ההרשאה הוסרה')) { invalidate(); void load() } }} />
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
