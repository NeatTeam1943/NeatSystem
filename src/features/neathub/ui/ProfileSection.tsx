import { Link } from 'react-router-dom'
import { ArrowLeft, Boxes } from 'lucide-react'
import type { Person } from '@/core/api'
import { useData } from '@/core/data'
import { useSession } from '@/core/session'
import { Badge, Card } from '@/ui'
import { neathubRepository } from '../data'
import { to } from './NeathubContext'

/** What a person edits in NEATHUB, on their profile (only mentors and leads with totes). */
export function ProfileSection({ person }: { person: Person }) {
  const s = useSession()
  const repo = neathubRepository({ me: s.me, people: s.people, can: s.can })
  const ed = useData(`neathub:editor:${person.id}:${s.me.id}`, () => repo.editor(person.id))
  const e = ed.data
  if (!e || (e.role !== 'mentor' && !(e.role === 'lead' && e.scopes.length))) return null
  return (
    <Card>
      <div className="cardhead">
        <span className="sysic"><Boxes size={18} aria-hidden /></span>
        <span className="h3 grow">NEATHUB</span>
        <Link to={to()} className="more">ל-NEATHUB<ArrowLeft size={14} aria-hidden /></Link>
      </div>
      {e.role === 'mentor' ? <p className="c2" style={{ margin: 0 }}>עורך/ת את כל ה-NEATHUB</p> : (
        <div><div className="psub">עורך/ת</div><div className="row wrap" style={{ gap: 6 }}>{e.scopes.map((x) => <Badge key={x.id} tone="blue">{x.title}</Badge>)}</div></div>
      )}
    </Card>
  )
}

/** The NEATHUB part of an archive record (neathub.snapshot). */
export function ArchiveView({ data }: { data: unknown }) {
  const edits = (data as { edits?: string[] } | null)?.edits ?? []
  return edits.length ? <div className="foot c2">ערך/ה: {edits.join(', ')}</div> : <div className="foot cm">לא ערך/ה ארגזים</div>
}
