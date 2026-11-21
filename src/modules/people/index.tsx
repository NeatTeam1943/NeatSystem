import { Link } from 'react-router-dom'
import { Cake, User, Users } from 'lucide-react'
import type { HubModule } from '@/core/module'
import { useSession } from '@/core/session'
import { positionText } from '@/core/labels'
import { todayMMDD } from '@/core/format'
import { Avatar, Card } from '@/ui'
import { PeoplePage, ProfilePage } from './pages'
import { useJoinInbox } from './join'

function Birthdays() {
  const s = useSession()
  const today = todayMMDD()
  const list = s.people.filter((p) => p.status === 'active' && p.birthday === today)
  if (!list.length) return null
  return (
    <Card mesh="orange" title={<span className="row"><Cake size={20} />יום הולדת שמח!</span>}>
      <div className="list">
        {list.map((p) => (
          <Link key={p.id} to={`/people/${p.id}`} className="lrow click">
            <Avatar name={p.full_name} src={p.avatar_url} size={42} />
            <div className="main2"><div className="ttl">{p.full_name}</div><div className="meta">{positionText(p, s.teams)}</div></div>
          </Link>
        ))}
      </div>
    </Card>
  )
}

export const peopleModule: HubModule = {
  id: 'people',
  nav: [{ to: '/people', label: 'חברי הקבוצה', icon: Users, order: 50, dock: 3 }],
  routes: [
    { path: 'people', element: <PeoplePage /> },
    { path: 'people/:id', element: <ProfilePage /> },
  ],
  useInbox: useJoinInbox,
  useSearch: (s) => s.people.filter((p) => p.status === 'active').map((p) => ({
    id: `p:${p.id}`, group: 'אנשים', label: p.full_name, sub: positionText(p, s.teams), to: `/people/${p.id}`, icon: User, keywords: p.nickname ?? '',
  })),
  home: [{ id: 'birthdays', order: 5, column: 'side', Component: Birthdays }],
}
