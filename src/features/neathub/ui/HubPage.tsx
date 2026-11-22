import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Info, Link as LinkIcon, Lock, Pencil, Users } from 'lucide-react'
import { childrenOf, ancestors, canView, canEditNode, canAddToHome, canEditAnything, recomputeSubtree, hubPath, resolvePath } from '../domain/model'
import { SEASONS, seasonOf, seasonLabel } from '../domain/seasons'
import type { HubNode } from '../domain/types'
import { DeniedError } from '../data'
import { useNeathub, to } from './NeathubContext'
import { Stage } from './Stage'
import { Drawer } from './Drawer'
import { Admin } from './Admin'
import { Search } from './Search'
import { About } from './About'

/** Where a path under /neathub leads: its home page, "who edits what", a tote by its path, or an old /h/<id> link. */
type Route = { kind: 'home' | 'admin'; key: string } | { kind: 'hub'; segs: string[]; key: string } | { kind: 'legacy'; id: string; key: string }
function parse(path: string): Route {
  const h = path.replace(/^\/+|\/+$/g, '')
  if (h === 'admin') return { kind: 'admin', key: 'admin' }
  const legacy = h.match(/^h\/([^/]+)$/)
  if (legacy) return { kind: 'legacy', id: decodeURIComponent(legacy[1]), key: h }
  if (!h) return { kind: 'home', key: '' }
  return { kind: 'hub', segs: h.split('/').map((s) => { try { return decodeURIComponent(s) } catch { return s } }), key: h }
}
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const ANIM_MS = 360

/** NEATHUB: the totes-and-pieces map of the team's links. */
export function HubPage() {
  const { nodes, editor, repo, reload, toast } = useNeathub()
  const { '*': rest = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const route = useMemo(() => parse(rest), [rest])
  const [anim, setAnim] = useState({ cls: 'enter-fade', origin: '50% 50%' })
  const [editMode, setEditMode] = useState(false)
  const [drawer, setDrawer] = useState<{ node: HubNode | null; parentId: string | null } | null>(null)
  const [gate, setGate] = useState<HubNode | null>(null) // a locked item the viewer can't open
  const [about, setAbout] = useState(false)
  const pendingEnter = useRef<string | null>(null)
  const urlCache = useRef(new Map<string, string>())
  const appRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLElement>(null)
  const pathTo = (id: string | null) => to(id ? hubPath(nodes, id) : '')

  useEffect(() => { if (!canEditAnything(editor)) setEditMode(false) }, [editor])
  useEffect(() => { urlCache.current.clear() }, [editor.role])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDrawer(null); setGate(null); setAbout(false) } }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  // Item scale: one number (--ts) that every tote / piece / cube size is a multiple of.
  // Phones: two items side by side; desktop: capped; short windows: a tote still fits.
  useEffect(() => {
    const fit = () => {
      const w = appRef.current?.clientWidth || window.innerWidth
      const h = window.innerHeight - 70
      const ts = Math.max(0.9, Math.min(1.7, (w - 40) / 330, (h - 170) / 270))
      appRef.current?.style.setProperty('--ts', ts.toFixed(3))
    }
    fit()
    addEventListener('resize', fit)
    return () => removeEventListener('resize', fit)
  }, [])

  // a new path: play the entering half of the transition that led here
  useEffect(() => {
    setAnim({ cls: pendingEnter.current || 'enter-fade', origin: '50% 50%' })
    pendingEnter.current = null
  }, [location.pathname])

  const hub = useMemo(() => (route.kind === 'hub' ? resolvePath(nodes, route.segs) : null), [nodes, route])
  useEffect(() => {
    if (route.kind === 'legacy') {
      const n = nodes.find((x) => x.id === route.id && x.type === 'hub')
      navigate(n ? pathTo(n.id) : to(), { replace: true })
    } else if (route.kind === 'hub') {
      // unknown path → home; a path by id (or an old slug) → its canonical form
      if (!hub) navigate(to(), { replace: true })
      else if (hubPath(nodes, hub.id) !== route.key) navigate(pathTo(hub.id), { replace: true })
    }
  }, [nodes, route, hub])

  // a shared link to a locked tote shows a lock screen instead of its contents
  const hubLocked = !!hub && !canView(editor, hub.effVis)
  const items = useMemo(() => (route.kind !== 'admin' && !hubLocked ? childrenOf(nodes, hub ? hub.id : null) : []), [nodes, hub, route.kind, hubLocked])
  const trail = hub ? ancestors(nodes, hub.id) : []

  // prefetch this level's URLs, so a click opens the link synchronously (no popup blocker)
  useEffect(() => {
    items.filter((n) => n.type === 'link' && canView(editor, n.effVis) && !urlCache.current.has(n.id)).forEach((n) =>
      repo.url(n.id).then((u) => { if (u) urlCache.current.set(n.id, u) }).catch(() => {}))
  }, [items, repo, editor])

  const go = (path: string, leaveCls: string, enterCls: string, origin = '50% 50%') => {
    if (reduced()) { navigate(path); return }
    setAnim({ cls: leaveCls, origin })
    pendingEnter.current = enterCls
    setTimeout(() => navigate(path), ANIM_MS)
  }
  const enterHub = (el: HTMLElement, node: HubNode) => {
    const r = el.getBoundingClientRect()
    const s = stageRef.current!.getBoundingClientRect()
    go(pathTo(node.id), 'leave-in', 'enter-in', `${r.left - s.left + r.width / 2}px ${r.top - s.top + r.height / 2}px`)
  }
  const goUp = (id: string | null) => go(pathTo(id), 'leave-out', 'enter-out')

  const openLink = async (node: HubNode) => {
    const cached = urlCache.current.get(node.id)
    if (cached) { window.open(cached, '_blank', 'noopener'); return }
    const w = window.open('about:blank', '_blank')
    try {
      const url = await repo.url(node.id)
      if (!url) throw new Error('missing')
      urlCache.current.set(node.id, url)
      if (w) { w.opener = null; w.location.href = url } else window.location.href = url
    } catch (e) {
      w?.close()
      if (e instanceof DeniedError) setGate(node)
      else toast('לא הצלחתי לפתוח את הקישור')
    }
  }
  const pickSearch = (node: HubNode) => {
    if (node.type === 'hub') go(pathTo(node.id), 'leave-out', 'enter-in')
    else void openLink(node)
  }
  const activate = (el: HTMLElement, node: HubNode) => {
    if (!canView(editor, node.effVis)) { setGate(node); return }
    if (node.type === 'hub') enterHub(el, node)
    else void openLink(node)
  }

  const shareHub = async () => {
    const url = window.location.href
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title: `${hub!.title} · NEATHUB`, url }); return }
      await navigator.clipboard.writeText(url)
      toast('הקישור הועתק')
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') window.prompt('העתיקו את הקישור:', url)
    }
  }
  const setSeason = async (year: number) => {
    if (!hub || !canEditNode(editor, hub)) return
    try { await repo.saveNodes(recomputeSubtree(nodes, { ...hub, season: year })); await reload() } catch { toast('אין הרשאה לשנות עונה') }
  }

  const canEditHere = editMode && (hub ? canEditNode(editor, hub) : canAddToHome(editor))
  const season = hub ? seasonOf(hub.season) : null

  return (
    <div className="nh-app" ref={appRef}>
      <header className="topbar">
        <nav className="crumbs" aria-label="מיקום">
          {route.kind === 'admin' ? (
            <><Link to={to()}>NEATHUB</Link> › <b>מי עורך מה</b></>
          ) : (
            <>
              {trail.length > 0 ? <a href={`#${to()}`} onClick={(e) => { e.preventDefault(); goUp(null) }}>NEATHUB</a> : <b className="home-title">NEATHUB</b>}
              {trail.map((n, i) => (
                <span key={n.id}>
                  {' › '}
                  {i === trail.length - 1 ? <b>{n.title}</b> : <a href={`#${pathTo(n.id)}`} onClick={(e) => { e.preventDefault(); goUp(n.id) }}>{n.title}</a>}
                </span>
              ))}
            </>
          )}
        </nav>
        <div className="spacer" />
        {route.kind !== 'admin' && <Search nodes={nodes} editor={editor} onPick={pickSearch} />}
        {canEditAnything(editor) && route.kind !== 'admin' && (
          <button type="button" className={`btn sm ${editMode ? 'primary' : 'tint'}`} onClick={() => setEditMode((v) => !v)} aria-pressed={editMode}>
            <Pencil size={16} aria-hidden /> <span className="ctl-label">{editMode ? 'סיום עריכה' : 'עריכה'}</span>
          </button>
        )}
        <button type="button" className="btn sm ghost about-btn" onClick={() => setAbout(true)} aria-label="אודות">
          <Info size={16} aria-hidden /> <span>אודות</span>
        </button>
        {editor.role === 'mentor' && route.kind !== 'admin' && (
          <Link className="btn sm ghost" to={to('admin')} aria-label="מי עורך מה"><Users size={16} aria-hidden /> <span className="ctl-label">מי עורך מה</span></Link>
        )}
      </header>

      <main className="stage" ref={stageRef}>
        {hub && !hubLocked && (
          <div className="hub-bar">
            <button type="button" className="back-btn" onClick={() => goUp(hub.parentId || null)} title={`חזרה ל${trail.length > 1 ? trail[trail.length - 2].title : 'דף הבית'}`}>
              <ArrowRight size={18} aria-hidden /> חזרה
            </button>
            {canEditHere ? (
              <label className="season-pick">
                <span>עונה</span>
                <select value={hub.season ?? season!.year} onChange={(e) => void setSeason(+e.target.value)}>
                  {SEASONS.map((s) => <option key={s.year} value={s.year}>{seasonLabel(s)}</option>)}
                </select>
              </label>
            ) : (
              <span className="season-tag">{seasonLabel(season!)}</span>
            )}
            <button type="button" className="share-btn" onClick={() => void shareHub()}>
              <LinkIcon size={18} aria-hidden /> העתקת קישור
            </button>
          </div>
        )}
        <div key={route.key} className={`view ${anim.cls}`} style={{ transformOrigin: anim.origin }}>
          {hubLocked ? (
            <div className="locked-hub">
              <Lock className="big-lock" aria-hidden />
              <h2>{hub.title}</h2>
              <p>אין לך הרשאה לפתוח את הארגז הזה. אפשר לבקש ממנטור.</p>
              <Link className="btn ghost" to={to()}>לדף הבית של NEATHUB</Link>
            </div>
          ) : route.kind === 'admin' ? (
            editor.role === 'mentor' ? <Admin /> : <p className="empty">רק מנטורים מחלקים הרשאות עריכה.</p>
          ) : (
            <Stage
              hub={hub}
              items={items}
              editor={editor}
              editMode={editMode}
              onActivate={activate}
              onEdit={(node) => setDrawer({ node, parentId: node.parentId })}
              onAdd={() => setDrawer({ node: null, parentId: hub ? hub.id : null })}
              kidsOf={(id) => childrenOf(nodes, id)}
            />
          )}
        </div>
      </main>

      {drawer && <Drawer node={drawer.node} parentId={drawer.parentId} onClose={() => setDrawer(null)} />}
      {about && <About onClose={() => setAbout(false)} />}
      {gate && (
        <div className="scrim center" onMouseDown={(e) => e.target === e.currentTarget && setGate(null)}>
          <div className="modal" role="dialog" aria-label="פריט נעול">
            <Lock className="big-lock" aria-hidden />
            <h2>{gate.title}</h2>
            <p>אין לך הרשאה לפתוח את זה. אפשר לבקש ממנטור.</p>
            <button type="button" className="btn ghost" onClick={() => setGate(null)}>סגירה</button>
          </div>
        </div>
      )}
    </div>
  )
}
