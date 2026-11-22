import { Link } from 'react-router-dom'
import { ArrowLeft, GraduationCap } from 'lucide-react'
import type { Person } from '@/core/api'
import { fmtAgo } from '@/core/format'
import { Badge, Card } from '@/ui'
import type { TrainingsSnapshot } from '../data'
import { useTrainings, to } from './TrainingsContext'
import { RankMark } from './common'

/** A person's trainings on their NeatSystem profile: rank, counts, next rank, categories, latest certifications. */
export function ProfileSection({ person }: { person: Person }) {
  const { M } = useTrainings()
  const uid = person.id
  const held = M.S.certs.filter((c) => c.user === uid && M.item(c.item))
  const team = M.teamCategory(person.team)
  const rank = M.isMentor(person) ? M.rank('nitmentor') : team ? M.rankIn(uid, team.id) : null
  if (!held.length && !rank) return null
  const nx = team ? M.next(uid, team.id) : null
  const cats = M.categoriesOf(uid)
  const recent = [...held].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5)
  return (
    <Card>
      <div className="cardhead">
        <span className="sysic"><GraduationCap size={18} aria-hidden /></span>
        <span className="h3 grow">הכשרות</span>
        <Link to={to(`/p/${uid}`)} className="more">להכשרות<ArrowLeft size={14} aria-hidden /></Link>
      </div>
      <div className="stack">
        <div className="pstats">
          <div className="pstat"><div className="v row" style={{ gap: 6 }}><RankMark rank={rank} size={26} />{rank?.name ?? 'עוד אין'}</div><div className="l">דרגה</div></div>
          <div className="pstat"><div className="v tnum">{held.length}</div><div className="l">הסמכות</div></div>
          <div className="pstat"><div className="v tnum">{held.filter((c) => c.teach).length}</div><div className="l">מלמד/ת</div></div>
        </div>
        {nx && nx.total > 0 && (
          <div className="pprog">
            <div className="row"><span className="grow w5">ל{nx.rank.name}</span><span className="tnum c2">{nx.have}/{nx.total}</span></div>
            <div className="bar" role="progressbar" aria-valuenow={nx.have} aria-valuemax={nx.total} aria-label={`ל${nx.rank.name}`}><i style={{ width: `${(nx.have / nx.total) * 100}%` }} /></div>
            <div className="foot c2">{nx.missing.length ? `עוד ${nx.missing.length} פריטים` : 'כל הפריטים הושלמו'}</div>
          </div>
        )}
        {cats.length > 0 && (
          <div><div className="psub">קטגוריות</div><div className="row wrap" style={{ gap: 6 }}>{cats.map((c) => {
            const r = M.rankIn(uid, c.id)
            return <Badge key={c.id} tone={M.isMember(uid, c.id) ? 'blue' : undefined}>{c.name}{r ? ` · ${r.name}` : ''}</Badge>
          })}</div></div>
        )}
        {recent.length > 0 && (
          <div><div className="psub">הסמכות אחרונות</div><div className="list">{recent.map((c) => {
            const i = M.item(c.item)!
            return (
              <div key={c.item} className="lrow" style={{ minHeight: 0 }}>
                <div className="main2"><div className="ttl">{i.name}</div><div className="meta">{M.category(i.category)?.name}{c.teach ? ' · מלמד/ת' : ''}</div></div>
                <span className="cap cm">{fmtAgo(c.at)}</span>
              </div>
            )
          })}</div></div>
        )}
      </div>
    </Card>
  )
}

/** The trainings part of an archive record. */
export function ArchiveView({ data }: { data: unknown }) {
  const d = data as Partial<TrainingsSnapshot> | null
  const certs = d?.certifications ?? [], ranks = d?.ranks ?? []
  if (!certs.length && !ranks.length) return <div className="foot cm">לא היו הסמכות</div>
  return (
    <div className="stack" style={{ gap: 8 }}>
      {ranks.length > 0 && <div className="row wrap" style={{ gap: 6 }}>{ranks.map((r) => <Badge key={r.category} tone="blue">{r.category} · {r.rank}{r.manual ? ' (ידני)' : ''}</Badge>)}</div>}
      {certs.length > 0 && <div className="foot c2">{certs.length} הסמכות: {certs.map((c) => c.item + (c.teaches ? ' (מלמד/ת)' : '')).join(', ')}</div>}
    </div>
  )
}
