import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, ArrowLeft, ChevronDown } from 'lucide-react'
import { api, type ArchiveRecord, type Person } from '@/core/api'
import { useData } from '@/core/data'
import { fmtAgo, fmtDate } from '@/core/format'
import { parseProfile, type Block, type Parsed } from '@/core/profileBlocks'
import type { LoadedTab, MockCtx } from '@/core/tabs'
import { useSession } from '@/core/session'
import { TABS } from '@/app/tabs'
import { Badge, Card, cx } from '@/ui'

/**
 * The profile page reads every sub-system's part of a person and draws it
 * itself. Reads only: Supabase mode calls <schema>.<fn>(p_user) with GET,
 * which PostgREST runs in a read-only transaction. Each system is fetched,
 * parsed and shown on its own — one broken system shows "לא זמין" and the
 * others are unaffected.
 */
const TIMEOUT_MS = 10_000

async function readProfile(t: LoadedTab, user: string, ctx: MockCtx): Promise<unknown> {
  const p = t.tab.profile!
  const call = (async () => {
    if (api.mode === 'mock' || !api.client) return t.tab.mock?.profile ? await t.tab.mock.profile(user, ctx) : { contract: 1, blocks: [] }
    const { data, error } = await api.client.schema(p.schema).rpc(p.fn, { p_user: user }, { get: true })
    if (error) return { error: error.code || 'error', detail: error.message }
    return data
  })()
  const timeout = new Promise((r) => setTimeout(() => r({ error: 'timeout', detail: 'אין תשובה' }), TIMEOUT_MS))
  try { return await Promise.race([call, timeout]) } catch (e) { return { error: 'exception', detail: (e as Error).message } }
}

const TONE: Record<string, 'ok' | 'warn' | 'bad' | 'blue' | 'orange' | undefined> = { ok: 'ok', warn: 'warn', bad: 'bad', brand: 'blue', reward: 'orange', muted: undefined }

export function BlockView({ b }: { b: Block }) {
  switch (b.kind) {
    case 'stats':
      return <div className="pstats">{b.items.map((i, n) => <div key={n} className="pstat"><div className="v tnum">{i.value}</div><div className="l">{i.label}</div>{i.hint && <div className="h">{i.hint}</div>}</div>)}</div>
    case 'progress':
      return (
        <div className="pprog">
          <div className="row"><span className="grow w5">{b.label}</span><span className="tnum c2">{b.value}/{b.max}</span></div>
          <div className="bar" role="progressbar" aria-valuenow={b.value} aria-valuemax={b.max} aria-label={b.label}><i style={{ width: `${(b.value / b.max) * 100}%` }} /></div>
          {b.hint && <div className="foot c2">{b.hint}</div>}
        </div>
      )
    case 'chips':
      return <div>{b.title && <div className="psub">{b.title}</div>}<div className="row wrap" style={{ gap: 6 }}>{b.items.map((i, n) => <Badge key={n} tone={i.tone ? TONE[i.tone] : undefined}>{i.label}</Badge>)}</div></div>
    case 'list':
      return (
        <div>{b.title && <div className="psub">{b.title}</div>}
          <div className="list">{b.items.map((i, n) => (
            <div key={n} className="lrow" style={{ minHeight: 0 }}>
              <div className="main2"><div className="ttl">{i.title}</div>{i.meta && <div className="meta">{i.meta}</div>}</div>
              {i.at && <span className="cap cm">{fmtAgo(i.at)}</span>}
            </div>
          ))}</div>
        </div>
      )
    case 'text':
      return <p className="c2" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{b.text}</p>
  }
}

function Section({ t, parsed, loading, showWhy }: { t: LoadedTab; parsed?: Parsed; loading?: boolean; showWhy: boolean }) {
  const Icon = t.tab.icon
  const head = (title?: string, link?: string) => (
    <div className="cardhead">
      {Icon && <span className="sysic"><Icon size={18} aria-hidden /></span>}
      <span className="h3 grow">{title || t.tab.label}</span>
      {link && <Link to={link} className="more">ל{t.tab.label}<ArrowLeft size={14} aria-hidden /></Link>}
    </div>
  )
  if (loading || !parsed) return <Card>{head()}<div className="skel" style={{ height: 70 }} /></Card>
  if (!parsed.ok) {
    return (
      <Card className="sysdown">
        {head()}
        <div className="foot c2">המידע מ{t.tab.label} לא זמין כרגע. שאר הפרופיל מעודכן.</div>
        {showWhy && <div className="cap cm" dir="ltr" style={{ textAlign: 'end', marginTop: 4 }}>{parsed.reason}: {parsed.detail}</div>}
      </Card>
    )
  }
  if (!parsed.blocks.length) return null
  return <Card>{head(parsed.title, parsed.link)}<div className="stack">{parsed.blocks.map((b, i) => <BlockView key={i} b={b} />)}</div></Card>
}

function LiveSection({ t, person, showWhy }: { t: LoadedTab; person: Person; showWhy: boolean }) {
  const s = useSession()
  const d = useData(`sysprofile:${t.tab.id}:${person.id}`, () => readProfile(t, person.id, { me: s.me, people: s.people, can: s.can }))
  return <Section t={t} loading={d.loading} parsed={d.data === undefined ? undefined : parseProfile(d.data)} showWhy={showWhy} />
}

/** All sub-systems' sections for one person, in tab order. */
export function SystemBlocks({ person }: { person: Person }) {
  const s = useSession()
  const tabs = TABS.tabs.filter((t) => t.tab.profile)
  if (!tabs.length) return null
  return <>{tabs.map((t) => <LiveSection key={t.tab.id} t={t} person={person} showWhy={s.can('audit.view')} />)}</>
}

/** Frozen records from when this person left the team. */
export function ArchiveRecords({ person }: { person: Person }) {
  const s = useSession()
  const recs = useData(s.can('users.edit_membership') ? `archives:${person.id}` : null, () => api.archives(person.id))
  const [open, setOpen] = useState<number | null>(null)
  if (!recs.data?.length) return null
  const label = (id: string) => TABS.tabs.find((t) => t.tab.id === id)?.tab.label ?? id
  return (
    <Card title={<span className="row"><Archive size={18} />ארכיון</span>}>
      <div className="list">
        {recs.data.map((r: ArchiveRecord) => (
          <div key={r.id} className="arec">
            <button type="button" className="lrow click" style={{ width: '100%', border: 0, background: 'none', textAlign: 'start' }} aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
              <div className="main2">
                <div className="ttl">עזב/ה ב-{fmtDate(r.archived_at)}{r.reason ? ` · ${r.reason}` : ''}</div>
                <div className="meta">{r.archived_by_name ? `ע״י ${r.archived_by_name}` : ''}{r.restored_at ? ` · הוחזר/ה ב-${fmtDate(r.restored_at)}` : ''}</div>
              </div>
              <ChevronDown size={18} className={cx('cm', open === r.id && 'rot180')} aria-hidden />
            </button>
            {open === r.id && (
              <div className="stack" style={{ padding: '4px 6px 12px' }}>
                <div className="foot c2">כך זה נראה ברגע ההעברה לארכיון:</div>
                {Object.entries(r.systems).map(([id, raw]) => {
                  const p = parseProfile(raw)
                  return (
                    <div key={id} className="subtle">
                      <div className="w7" style={{ marginBottom: 6 }}>{label(id)}</div>
                      {p.ok ? (p.blocks.length ? <div className="stack">{p.blocks.map((b, i) => <BlockView key={i} b={b} />)}</div> : <div className="foot cm">לא היה מידע</div>)
                        : <div className="foot cm">לא נשמר ({p.detail})</div>}
                    </div>
                  )
                })}
                <div className="foot cm">{r.audit.length} פעולות ביומן נשמרו יחד עם הרשומה.</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
