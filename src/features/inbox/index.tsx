import { useMemo, useState } from 'react'
import { CheckCheck, Inbox } from 'lucide-react'
import { useFeatures, type Feature, type InboxItem } from '@/core/feature'
import { useSession } from '@/core/session'
import { Chips, Empty, PageHead, cx } from '@/ui'

/** Collects "waiting for you" items from every feature. Hooks are called in a fixed order (the feature list never changes at runtime). */
export function useInboxItems(): InboxItem[] {
  const s = useSession()
  const all: InboxItem[] = []
  for (const m of useFeatures()) if (m.useInbox) all.push(...m.useInbox(s))
  return all.sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent) || a.at.localeCompare(b.at))
}

function InboxPage() {
  const items = useInboxItems()
  const [kind, setKind] = useState('all')
  const [gone, setGone] = useState<Set<string>>(new Set())
  const visible = items.filter((i) => !gone.has(i.id))
  const kinds = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>()
    visible.forEach((i) => m.set(i.kind, { label: i.kindLabel, n: (m.get(i.kind)?.n ?? 0) + 1 }))
    return [...m.entries()]
  }, [visible])
  const list = visible.filter((i) => kind === 'all' || i.kind === kind)
  return (
    <div className="page">
      <PageHead title="לטיפולי" sub="כל מה שמחכה לך, מכל המערכות, במקום אחד" />
      {kinds.length > 1 && (
        <div style={{ marginBottom: 14 }}>
          <Chips label="סוג" value={kind} onChange={setKind} items={[{ id: 'all', label: `הכל · ${visible.length}` }, ...kinds.map(([id, k]) => ({ id, label: `${k.label} · ${k.n}` }))]} />
        </div>
      )}
      {list.length === 0 ? (
        <div className="card"><Empty icon={CheckCheck} title="אין כלום שמחכה לך">כשמשהו יחכה לאישור שלך, הוא יופיע כאן.</Empty></div>
      ) : (
        <div className="card" style={{ padding: 6 }}>
          {list.map((i) => (
            <div key={i.id} className={cx('ibx', i.urgent && 'urgent')}>
              <span className="ic"><i.icon size={20} aria-hidden /></span>
              <div className="body">
                <div className="ttl">{i.title}</div>
                <div className="meta">{i.meta}{i.urgent && <span className="badge warn" style={{ marginInlineStart: 6 }}>מחכה יותר מ-3 ימים</span>}</div>
              </div>
              <div className="acts"><i.Actions done={() => setGone((g) => new Set(g).add(i.id))} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export const inboxFeature: Feature = {
  id: 'inbox',
  nav: [{ to: '/inbox', label: 'לטיפולי', icon: Inbox, order: 20, dock: 2, useBadge: () => useInboxItems().length }],
  routes: [{ path: 'inbox', element: <InboxPage /> }],
}
