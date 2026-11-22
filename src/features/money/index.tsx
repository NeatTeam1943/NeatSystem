import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, LogIn, ShoppingCart, Wallet } from 'lucide-react'
import { isMock, MONEYTEAM_URL } from '@/core/api'
import { getMockPersona } from '@/core/api/mockApi'
import { invalidate, useData } from '@/core/data'
import type { Feature } from '@/core/feature'
import { useSession, type Session } from '@/core/session'
import { Badge, Button, Card, PageHead } from '@/ui'
import { makeMoneyBridge, OPEN_STATUSES, ROLE_HE, SHOPPING_STATUS_HE, type MoneyBridge, type ShoppingItem } from './bridge'

/**
 * MoneyTeam stays its own site and its own Supabase project — nothing in it
 * changes. See bridge.ts for how "open MoneyTeam already signed in" works.
 */
const env = import.meta.env

const mockBridge: MoneyBridge = {
  configured: true,
  async role() {
    const r = ({ u1: 'mentor', u2: 'mentor', u3: 'editor', u11: 'student' } as Record<string, string>)[getMockPersona()]
    return { connected: !!r, role: r ?? null }
  },
  async openShopping() {
    if (!['u1', 'u2', 'u3', 'u11'].includes(getMockPersona())) return []
    return ([
      ['מנוע Kraken X60', 'pending_approval', 2], ['ברגים M5 (100)', 'approved', 1], ['סוללות 12V', 'waiting_finance', 4],
      ['מצלמה Limelight', 'waiting_sponsor', 1], ['פרופיל אלומיניום 1×1', 'approved', 6],
    ] as const).map(([name, status, quantity], i) => ({ id: String(i), name, status, quantity }))
  },
  open: () => { window.open(MONEYTEAM_URL, '_blank', 'noopener') },
}

export const money: MoneyBridge = isMock ? mockBridge : makeMoneyBridge(MONEYTEAM_URL, env.VITE_MONEYTEAM_SUPABASE_URL, env.VITE_MONEYTEAM_SUPABASE_ANON_KEY)
const openMoney = (s: Session, path = '') => money.open(path, s.state.kind === 'active' ? s.state.user.email : '')

function useMoney() {
  const s = useSession()
  return useData(`money:role:${s.me.id}`, () => money.role())
}

function MoneyCard() {
  const s = useSession()
  const nav = useNavigate()
  const role = useMoney()
  const shop = useData(role.data?.role ? `money:shop:${s.me.id}` : null, () => money.openShopping())
  if (role.loading || !role.data?.role) return null
  const items: ShoppingItem[] = shop.data ?? []
  const counts = OPEN_STATUSES.map((st) => [st, items.filter((i) => i.status === st).length] as const).filter(([, n]) => n > 0)
  return (
    <Card>
      <div className="row" style={{ gap: 12, marginBottom: 12 }}>
        <span className="avatar" style={{ width: 44, height: 44, background: 'var(--orange-dim)', color: 'var(--orange-hi)' }}><ShoppingCart size={20} /></span>
        <div className="grow"><div className="w7">רשימת קניות פתוחה</div><div className="foot c2">מ-MoneyTeam · {ROLE_HE[role.data.role] ?? role.data.role}</div></div>
        <Button size="sm" variant="tint" onClick={() => nav('/money/shopping')}>לרשימה<ArrowLeft size={14} /></Button>
      </div>
      {shop.loading ? <div className="skel" style={{ height: 90 }} /> : items.length === 0 ? <div className="foot c2">אין פריטים פתוחים</div> : (
        <>
          <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
            {counts.map(([st, n]) => <Badge key={st} tone={st === 'approved' ? 'ok' : 'warn'}>{SHOPPING_STATUS_HE[st]} · {n}</Badge>)}
          </div>
          <div className="list">
            {items.slice(0, 5).map((i) => (
              <div key={i.id} className="lrow" style={{ minHeight: 44 }}>
                <div className="main2"><div className="ttl">{i.name}{i.quantity > 1 && <span className="cm w5"> ×{i.quantity}</span>}</div></div>
                <span className="cap c2">{SHOPPING_STATUS_HE[i.status] ?? i.status}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}

/**
 * MoneyTeam as a tab: its own site, unchanged, in a same-origin iframe.
 * Its login is separate (own Supabase project). The first time in a browser
 * the person signs in once through the bridge (a new tab that returns to
 * MoneyTeam); MoneyTeam stores its session in the shared localStorage, the
 * 'storage' event fires here, and the frame appears. Google refuses to run
 * its sign-in inside a frame, which is why that one step is a separate tab.
 */
function MoneyPage() {
  const s = useSession()
  const role = useMoney()
  const { '*': rest = '' } = useParams()
  useEffect(() => {
    const f = (e: StorageEvent) => { if (e.key?.startsWith('sb-')) invalidate('money:') }
    window.addEventListener('storage', f)
    return () => window.removeEventListener('storage', f)
  }, [])
  if (isMock) {
    return (
      <div className="page">
        <PageHead title="MoneyTeam" sub="בפריסה האמיתית MoneyTeam עצמו נטען כאן, בלי שינוי" />
        <div className="grid2"><MoneyCard /><Card mesh="dark"><div className="foot c2">MoneyTeam הוא אתר ופרויקט נפרדים. NeatSystem רק מציג אותו בתוך הטאב וקורא ממנו את מה שהוא כבר מרשה לראות.</div></Card></div>
      </div>
    )
  }
  if (money.configured && role.loading) return <div className="page"><div className="skel" style={{ height: 320 }} /></div>
  if (money.configured && !role.data?.connected) {
    return (
      <div className="page">
        <PageHead title="MoneyTeam" />
        <Card className="moneyconnect">
          <div className="row top" style={{ gap: 14 }}>
            <span className="sysic lg"><Wallet size={24} aria-hidden /></span>
            <div className="grow">
              <div className="h3">חיבור ל-MoneyTeam</div>
              <p className="c2" style={{ margin: '4px 0 12px' }}>פעם אחת בכל דפדפן: נפתחת כרטיסייה, מאשרים את חשבון ה-Google, וחוזרים לכאן. מכאן והלאה MoneyTeam נפתח ישר בתוך הטאב.</p>
              <Button variant="primary" icon={LogIn} onClick={() => openMoney(s)}>התחברות ל-MoneyTeam</Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }
  return <iframe className="moneyframe" title="MoneyTeam" src={MONEYTEAM_URL + (rest ? `#/${rest}` : '')} />
}

export const moneyFeature: Feature = {
  id: 'money',
  // Shown to everyone: MoneyTeam itself decides what each person may see.
  nav: [{ to: '/money', label: 'MoneyTeam', icon: Wallet, order: 80 }],
  routes: [{ path: 'money/*', element: <MoneyPage /> }],
  useSearch: () => [{ id: 'money', group: 'מערכות', label: 'MoneyTeam', sub: 'כספים וקניות', to: '/money', icon: Wallet }],
  home: [{ id: 'money', order: 50, column: 'side', Component: MoneyCard }],
}
