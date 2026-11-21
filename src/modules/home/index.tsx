import { Link } from 'react-router-dom'
import { ArrowLeft, House, Inbox } from 'lucide-react'
import type { HubModule } from '@/core/module'
import { useSession } from '@/core/session'
import { firstName, gradeLabel, gradeOf, POSITION_LABEL, teamName } from '@/core/labels'
import { fmtToday } from '@/core/format'
import { MODULES } from '@/app/modules'
import { Avatar, PageHead } from '@/ui'
import { useInboxItems } from '../inbox'

function HomePage() {
  const s = useSession()
  const me = s.me
  const inbox = useInboxItems()
  const widgets = MODULES.flatMap((m) => m.home ?? []).filter((w) => !w.visible || w.visible(s)).sort((a, b) => a.order - b.order)
  const kinds = [...new Set(inbox.map((i) => i.kindLabel))]
  const grade = gradeOf(me.grad_year)
  return (
    <div className="page">
      <PageHead title={`היי ${me.nickname || firstName(me)}`} sub={fmtToday()} />
      <div className="grid2">
        <div className="stack">
          {inbox.length > 0 && (
            <Link to="/inbox" className="card mesh orange click hero">
              <span className="heroic"><Inbox size={24} aria-hidden /></span>
              <span className="grow">
                <span className="cap" style={{ opacity: 0.85 }}>מחכה לך</span>
                <span className="h2" style={{ display: 'block' }}>{inbox.length === 1 ? 'פריט אחד לטיפולך' : `${inbox.length} פריטים לטיפולך`}</span>
                <span className="foot" style={{ opacity: 0.85 }}>{kinds.join(' · ')}</span>
              </span>
              <span className="btn sm white only-desk">לטיפולי<ArrowLeft size={16} /></span>
            </Link>
          )}
          <Link to={`/people/${me.id}`} className="card mesh blue click hero">
            <Avatar name={me.full_name} src={me.avatar_url} size={64} />
            <span className="grow">
              <span className="cap" style={{ opacity: 0.85 }}>הפרופיל שלי</span>
              <span className="h2" style={{ display: 'block' }}>{me.full_name}</span>
              <span className="foot" style={{ opacity: 0.9 }}>{[me.position && POSITION_LABEL[me.position], me.position !== 'mentor' && teamName(s.teams, me.team), grade && `כיתה ${gradeLabel(grade)}`].filter(Boolean).join(' · ')}</span>
            </span>
            <ArrowLeft size={20} aria-hidden />
          </Link>
          {widgets.filter((w) => w.column === 'main').map((w) => <w.Component key={w.id} />)}
        </div>
        <div className="stack">
          {widgets.filter((w) => w.column === 'side').map((w) => <w.Component key={w.id} />)}
        </div>
      </div>
    </div>
  )
}

export const homeModule: HubModule = {
  id: 'home',
  nav: [{ to: '/', label: 'בית', icon: House, order: 10, dock: 1 }],
  routes: [{ path: '', element: <HomePage /> }],
}
