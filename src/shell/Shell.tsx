import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ExternalLink, LogOut, Menu, Pencil, Search, User } from 'lucide-react'
import { api } from '@/core/api'
import { useFeatures, type NavEntry, type SearchItem } from '@/core/feature'
import { useSession } from '@/core/session'
import { Avatar, IconButton, Sheet, cx } from '@/ui'
import { EditMyProfileSheet } from '@/features/people/forms'

function useNav(): NavEntry[] {
  const s = useSession()
  return useFeatures().flatMap((m) => m.nav ?? []).filter((n) => !n.visible || n.visible(s)).sort((a, b) => a.order - b.order)
}

/** Badge counts are hooks; call them for every entry in a fixed order. */
function useBadges(): Record<string, number> {
  const s = useSession()
  const out: Record<string, number> = {}
  for (const n of useFeatures().flatMap((m) => m.nav ?? [])) if (n.useBadge) out[n.to] = n.useBadge(s)
  return out
}

function NavItem({ n, badge, className }: { n: NavEntry; badge?: number; className: string }) {
  const s = useSession()
  const Icon = n.icon
  if (n.external) {
    return (
      <a href={n.to} target="_blank" rel="noopener" className={className} title={`${n.label} (נפתח בכרטיסייה חדשה)`}
        onClick={n.action ? (e) => { e.preventDefault(); n.action!(s) } : undefined}>
        <Icon size={22} aria-hidden /><span>{n.label}</span><ExternalLink size={11} className="ext" aria-hidden />
      </a>
    )
  }
  return (
    <NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => cx(className, isActive && 'on')}>
      <Icon size={22} aria-hidden /><span>{n.label}</span>{!!badge && <span className="count">{badge}</span>}
    </NavLink>
  )
}

function Rail({ nav, badges }: { nav: NavEntry[]; badges: Record<string, number> }) {
  const main = nav.filter((n) => n.order < 80)
  const rest = nav.filter((n) => n.order >= 80)
  return (
    <nav className="rail" aria-label="ניווט ראשי">
      <Link to="/" className="brand" aria-label="NeatSystem — בית"><span className="brandmark">N</span><span>NeatSystem</span></Link>
      {main.map((n) => <NavItem key={n.to} n={n} badge={badges[n.to]} className="navi" />)}
      {rest.length > 0 && <div className="sep" />}
      {rest.map((n) => <NavItem key={n.to} n={n} badge={badges[n.to]} className="navi" />)}
    </nav>
  )
}

function Dock({ nav, badges }: { nav: NavEntry[]; badges: Record<string, number> }) {
  const s = useSession()
  const [more, setMore] = useState(false)
  const loc = useLocation()
  const main = nav.filter((n) => n.dock).sort((a, b) => a.dock! - b.dock!).slice(0, 4)
  const rest = nav.filter((n) => !main.includes(n))
  const restActive = rest.some((n) => !n.external && n.to !== '/' && loc.pathname.startsWith(n.to))
  return (
    <>
      <nav className="dock" aria-label="ניווט">
        {main.map((n) => <NavItem key={n.to} n={n} badge={badges[n.to]} className="" />)}
        {rest.length > 0 && (
          <button className={restActive ? 'on' : ''} onClick={() => setMore(true)} aria-haspopup="dialog">
            <Menu size={22} aria-hidden /><span>עוד</span>
          </button>
        )}
      </nav>
      {more && (
        <Sheet title="עוד" onClose={() => setMore(false)}>
          <div className="list">
            {rest.map((n) => {
              const I = n.icon
              const body = <><span className="avatar" style={{ width: 40, height: 40, background: 'var(--brand-subtle)', color: 'var(--brand-text)' }}><I size={20} /></span><span className="main2 ttl">{n.label}</span>{n.external && <ExternalLink size={16} className="cm" />}</>
              return n.external
                ? <a key={n.to} href={n.to} target="_blank" rel="noopener" className="lrow click" onClick={(e) => { setMore(false); if (n.action) { e.preventDefault(); n.action(s) } }}>{body}</a>
                : <Link key={n.to} to={n.to} className="lrow click" onClick={() => setMore(false)}>{body}</Link>
            })}
          </div>
        </Sheet>
      )}
    </>
  )
}

function UserMenu() {
  const s = useSession()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', f)
    return () => document.removeEventListener('mousedown', f)
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="iconbtn" aria-label="תפריט משתמש" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Avatar name={s.me.full_name} src={s.me.avatar_url} size={34} />
      </button>
      {open && (
        <div className="menu" style={{ top: 48, insetInlineEnd: 0 }} role="menu">
          <div style={{ padding: '8px 10px 10px' }}><div className="w7">{s.me.full_name}</div><div className="foot c2" dir="ltr" style={{ textAlign: 'end' }}>{s.state.kind === 'active' ? s.state.user.email : ''}</div></div>
          <button role="menuitem" onClick={() => { setOpen(false); nav(`/people/${s.me.id}`) }}><User size={16} />הפרופיל שלי</button>
          <button role="menuitem" onClick={() => { setOpen(false); setEdit(true) }}><Pencil size={16} />עריכת הפרטים שלי</button>
          <button role="menuitem" onClick={() => { setOpen(false); void api.signOut() }}><LogOut size={16} />התנתקות</button>
        </div>
      )}
      {edit && <EditMyProfileSheet me={s.me} onClose={() => setEdit(false)} />}
    </div>
  )
}

function Palette({ onClose }: { onClose: () => void }) {
  const s = useSession()
  const nav = useNavigate()
  const navEntries = useNav()
  const fromFeatures: SearchItem[] = []
  for (const m of useFeatures()) if (m.useSearch) fromFeatures.push(...m.useSearch(s))
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const items = useMemo(() => {
    const pages: SearchItem[] = navEntries.map((n) => ({ id: `nav:${n.to}`, group: 'עמודים', label: n.label, to: n.to, icon: n.icon, action: n.action ? () => n.action!(s) : undefined }))
    const all = [...pages, ...fromFeatures.filter((x) => !pages.some((p) => p.to === x.to))]
    const t = q.trim()
    return (t ? all.filter((x) => `${x.label} ${x.sub ?? ''} ${x.keywords ?? ''}`.includes(t)) : pages).slice(0, 30)
  }, [q, navEntries, fromFeatures, s])
  const go = (x: SearchItem) => { onClose(); if (x.action) x.action(); else if (/^https?:/.test(x.to)) window.open(x.to, '_blank', 'noopener'); else nav(x.to) }
  let lastGroup = ''
  return (
    <div className="scrim top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="חיפוש">
        <input autoFocus value={q} placeholder="חיפוש אנשים ועמודים…" aria-label="חיפוש"
          onChange={(e) => { setQ(e.target.value); setSel(0) }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((x) => Math.min(x + 1, items.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((x) => Math.max(x - 1, 0)) }
            if (e.key === 'Enter' && items[sel]) go(items[sel])
          }} />
        <div className="res" role="listbox">
          {items.length === 0 && <div className="foot c2" style={{ padding: 16 }}>לא נמצא כלום</div>}
          {items.map((x, i) => {
            const head = x.group !== lastGroup ? (lastGroup = x.group) : null
            const I = x.icon
            return (
              <div key={x.id}>
                {head && <div className="grp">{head}</div>}
                <div role="option" aria-selected={i === sel} className={cx('it', i === sel && 'sel')} onMouseEnter={() => setSel(i)} onClick={() => go(x)}>
                  {I && <I size={18} className="c2" />}<span className="grow">{x.label}</span>{x.sub && <span className="foot c2">{x.sub}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function Shell() {
  const nav = useNav()
  const badges = useBadges()
  const [scrolled, setScrolled] = useState(false)
  const [palette, setPalette] = useState(false)
  const loc = useLocation()
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 30)
    window.addEventListener('scroll', f, { passive: true })
    return () => window.removeEventListener('scroll', f)
  }, [])
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true) } }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [])
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  const title = nav.find((n) => !n.external && (n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to)))?.label ?? ''

  return (
    <div className="shell">
      <Rail nav={nav} badges={badges} />
      <div className="main">
        <header className={cx('topbar', scrolled && 'scrolled')}>
          <Link to="/" className="brandmark sm only-phone" aria-label="בית">N</Link>
          <span className="title">{title}</span>
          <span className="grow" />
          <button className="searchbtn only-desk" onClick={() => setPalette(true)}><Search size={16} />חיפוש אנשים ועמודים…<kbd>Ctrl K</kbd></button>
          <span className="only-phone"><IconButton icon={Search} label="חיפוש" onClick={() => setPalette(true)} /></span>
          <UserMenu />
        </header>
        <main className="content" id="main">
          <Outlet />
        </main>
      </div>
      <Dock nav={nav} badges={badges} />
      {palette && <Palette onClose={() => setPalette(false)} />}
    </div>
  )
}
