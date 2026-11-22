import { useState } from 'react'
import { Archive, ChevronDown } from 'lucide-react'
import { api, type ArchiveRecord, type Person } from '@/core/api'
import { useData } from '@/core/data'
import { useFeatures } from '@/core/feature'
import { fmtDate } from '@/core/format'
import { useSession } from '@/core/session'
import { Card, cx } from '@/ui'

/** What each feature kept when this person was archived (hub.member_archives). */
export function ArchiveRecords({ person }: { person: Person }) {
  const s = useSession()
  const features = useFeatures()
  const recs = useData(s.can('users.edit_membership') ? `archives:${person.id}` : null, () => api.archives(person.id))
  const [open, setOpen] = useState<number | null>(null)
  if (!recs.data?.length) return null
  const featureOf = (id: string) => features.find((f) => f.id === id)
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
                {Object.entries(r.systems).map(([id, data]) => {
                  const f = featureOf(id)
                  const failed = !!data && typeof data === 'object' && 'error' in data
                  return (
                    <div key={id} className="subtle">
                      <div className="w7" style={{ marginBottom: 6 }}>{f?.nav?.[0]?.label ?? id}</div>
                      {failed ? <div className="foot cm">לא נשמר</div>
                        : f?.ArchiveView ? <f.ArchiveView data={data} />
                          : <pre className="foot c2" style={{ margin: 0, whiteSpace: 'pre-wrap' }} dir="ltr">{JSON.stringify(data, null, 1)}</pre>}
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
