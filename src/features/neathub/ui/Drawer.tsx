import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { ArrowLeft, ArrowRight, Box, ClipboardList, FileText, Globe, HardDrive, Palette, Presentation, Table, Trash2, Trophy, Upload, Code, Video, X, type LucideIcon } from 'lucide-react'
import { Confirm } from '@/ui'
import { SEASONS, PIECES, seasonOf, seasonLabel, DEFAULT_SEASON } from '../domain/seasons'
import { VIS_LABEL, VIS_RANK, childrenOf, descendants, canEditNode, canAddToHome, canDeleteNode, recomputeSubtree, newId, ancestors, slugify, hubPath, SLUG_RE, RESERVED_SLUGS } from '../domain/model'
import { detectLink, isValidUrl, type LinkKind } from '../domain/links'
import type { HubNode, LabelMode, Visibility } from '../domain/types'
import { DeniedError } from '../data'
import { findSiteIcon, resizeImage } from './images'
import { Tote, Piece, Cube } from './Items'
import { useNeathub, to } from './NeathubContext'

const KIND_ICON: Record<LinkKind, LucideIcon> = {
  slides: Presentation, docs: FileText, sheets: Table, forms: ClipboardList, drive: HardDrive, canva: Palette,
  video: Video, code: Code, tba: Trophy, cad: Box, web: Globe,
}
const MODES: [LabelMode, string][] = [['txt', 'טקסט'], ['img', 'תמונה'], ['both', 'שניהם']]

/** Add / edit one node. `node` is null for a new item created inside `parentId`. */
export function Drawer({ node, parentId, onClose }: { node: HubNode | null; parentId: string | null; onClose: () => void }) {
  const { nodes, editor: profile, repo, reload, toast } = useNeathub()
  const isNew = !node
  const [d, setD] = useState<HubNode>(() =>
    node
      ? { ...node }
      : {
          id: newId(), parentId, type: 'link', title: '', labelMode: 'txt', labelText: '',
          imageData: null, imageUrl: null, season: DEFAULT_SEASON, piece: null, visibility: 'public',
          effVis: 'public', scope: '', order: 0, createdBy: profile.uid || null,
        },
  )
  const [url, setUrl] = useState('')
  const [origUrl, setOrigUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [iconBusy, setIconBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = (patch: Partial<HubNode>) => setD((x) => ({ ...x, ...patch }))

  useEffect(() => {
    if (node?.type === 'link') {
      repo.url(node.id).then((u) => { setUrl(u || ''); setOrigUrl(u || '') }).catch(() => {})
    }
  }, [node, repo])

  const parent = nodes.find((n) => n.id === d.parentId) || null
  const parentEff = parent ? parent.effVis : 'public'
  const effective = VIS_RANK[d.visibility] >= VIS_RANK[parentEff] ? d.visibility : parentEff
  const season = seasonOf(parent ? parent.season : DEFAULT_SEASON)
  const link = d.type === 'link' ? detectLink(url) : null

  // Hubs this user may move the item into (never into itself or its own subtree).
  const targets = useMemo(() => {
    const banned = new Set([d.id, ...descendants(nodes, d.id).map((n) => n.id)])
    return nodes
      .filter((n) => n.type === 'hub' && !banned.has(n.id) && canEditNode(profile, n))
      .map((n) => ({ id: n.id, path: ancestors(nodes, n.id).map((a) => a.title).join(' › ') }))
      .sort((a, b) => a.path.localeCompare(b.path))
  }, [nodes, d.id, profile])

  const siblings = childrenOf(nodes, d.parentId ?? null).filter((n) => n.id !== d.id)
  const subtree = isNew ? [] : descendants(nodes, d.id)

  async function pickSiteIcon() {
    setIconBusy(true)
    try {
      const icon = await findSiteIcon(url.trim())
      set({ ...icon, imageData: null, labelMode: d.labelMode === 'txt' ? 'both' : d.labelMode })
    } finally {
      setIconBusy(false)
    }
  }

  async function onImage(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const data = await resizeImage(f)
      set({ imageData: data, imageUrl: null, imageFallback: null, labelMode: d.labelMode === 'txt' ? 'both' : d.labelMode })
    } catch {
      setErr('לא הצלחתי לקרוא את התמונה.')
    }
    e.target.value = ''
  }

  async function save() {
    setErr('')
    if (!d.title.trim()) return setErr('צריך שם.')
    if (d.type === 'link' && !isValidUrl(url)) return setErr('הקישור צריך להתחיל ב-https://')
    if (d.labelMode !== 'txt' && !d.imageData && !d.imageUrl) return setErr('בחרו תמונה, או עברו למצב טקסט.')
    let slug: string | null = null
    if (d.type === 'hub') {
      slug = (d.slug || '').trim() || slugify(d.title) || null
      if (slug && !SLUG_RE.test(slug)) return setErr('כתובת: רק אותיות באנגלית, ספרות ומקפים.')
      if (slug && !d.parentId && RESERVED_SLUGS.includes(slug)) return setErr(`הכתובת "${slug}" שמורה. בחרו אחרת.`)
      const clash = childrenOf(nodes, d.parentId ?? null).some((n) => n.id !== d.id && n.type === 'hub' && (n.slug || n.id) === slug)
      if (slug && clash) return setErr('כבר יש ארגז עם הכתובת הזאת באותו מקום.')
    }
    const order = isNew ? Math.max(-1, ...siblings.map((s) => s.order ?? 0)) + 1 : d.order
    const clean: HubNode = {
      ...d, title: d.title.trim(), labelText: (d.labelText || '').trim(), order,
      season: d.type === 'hub' ? d.season : null,
      slug,
      piece: d.type === 'link' ? d.piece : null,
    }
    if (node && clean.parentId !== node.parentId) {
      clean.order = Math.max(-1, ...childrenOf(nodes, clean.parentId ?? null).map((s) => s.order ?? 0)) + 1
    }
    const changed = recomputeSubtree(nodes, clean)
    const urls = d.type === 'link' && (isNew || url !== origUrl) ? { [d.id]: url.trim() } : {}
    setBusy(true)
    try {
      // A lead who puts a new tote on the home page gets permission to fill it.
      const grant = isNew && d.type === 'hub' && !clean.parentId && profile.role === 'lead' ? clean.id : null
      await repo.saveNodes(changed, urls, grant)
      await reload()
      toast(isNew ? 'נוסף' : 'נשמר')
      onClose()
    } catch (e) {
      setErr(e instanceof DeniedError ? 'אין לך הרשאה לשמור כאן.' : 'השמירה נכשלה. נסו שוב.')
    } finally {
      setBusy(false)
    }
  }

  async function move(dir: number) {
    const all = childrenOf(nodes, d.parentId ?? null)
    const i = all.findIndex((n) => n.id === d.id)
    const j = i + dir
    if (j < 0 || j >= all.length) return
    const a = { ...all[i], order: all[j].order ?? j }
    const b = { ...all[j], order: all[i].order ?? i }
    if (a.order === b.order) { a.order = j; b.order = i }
    try {
      await repo.saveNodes([a, b])
      await reload()
      set({ order: a.order })
    } catch {
      setErr('לא הצלחתי להזיז.')
    }
  }

  async function remove() {
    if (!node) return
    setBusy(true)
    try {
      await repo.deleteNodes([node, ...subtree].map((n) => n.id))
      await reload()
      toast('נמחק')
      onClose()
    } catch {
      setErr('המחיקה נכשלה.')
      setBusy(false)
    }
  }

  const preview = { ...d, labelText: d.labelText || d.title || 'שם' }

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-label={isNew ? 'הוספת פריט' : 'עריכת פריט'}>
        <header>
          <h2>{isNew ? 'הוספה' : 'עריכה'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="סגירה"><X size={18} aria-hidden /></button>
        </header>

        <div className="preview">
          {d.type === 'hub' ? (
            <div className="pv-tote"><Tote node={preview} season={seasonOf(d.season)} /></div>
          ) : parent ? (
            <div className="pv-piece"><Piece node={preview} pieceKey={d.piece && season.pieces.includes(d.piece) ? d.piece : season.pieces[0]} /></div>
          ) : (
            <div className="pv-cube"><Cube node={preview} /></div>
          )}
        </div>

        {isNew && (
          <div className="field">
            <span className="lbl">סוג</span>
            <div className="seg">
              <button type="button" className={d.type === 'link' ? 'on' : ''} onClick={() => set({ type: 'link' })}>קישור</button>
              <button type="button" className={d.type === 'hub' ? 'on' : ''} onClick={() => set({ type: 'hub' })}>ארגז (האב)</button>
            </div>
          </div>
        )}

        <label className="field">
          <span className="lbl">שם</span>
          <input value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="מדריך WPILib" maxLength={60} />
        </label>

        {d.type === 'link' && (
          <label className="field">
            <span className="lbl">קישור</span>
            <input dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.wpilib.org" />
            {link && (
              <span className="chip"><LinkIcon kind={link.kind} /> {link.name}</span>
            )}
          </label>
        )}

        <div className="field">
          <span className="lbl">מה מופיע במרכז</span>
          <div className="seg">
            {MODES.map(([m, t]) => (
              <button type="button" key={m} className={d.labelMode === m ? 'on' : ''} onClick={() => set({ labelMode: m })}>{t}</button>
            ))}
          </div>
        </div>

        {d.labelMode !== 'img' && (
          <label className="field">
            <span className="lbl">טקסט קצר</span>
            <input value={d.labelText} onChange={(e) => set({ labelText: e.target.value })} placeholder={d.title || 'WPILib'} maxLength={18} />
          </label>
        )}

        {d.labelMode !== 'txt' && (
          <div className="field">
            <span className="lbl">תמונה</span>
            <div className="row-btns">
              <label className="btn"><Upload size={16} aria-hidden /> העלאה<input type="file" accept="image/*" hidden onChange={onImage} /></label>
              {d.type === 'link' && isValidUrl(url) && (
                <button type="button" className="btn" disabled={iconBusy} onClick={pickSiteIcon}>
                  <Globe size={16} aria-hidden /> {iconBusy ? 'מחפש…' : 'אייקון האתר'}
                </button>
              )}
              {(d.imageData || d.imageUrl) && (
                <button type="button" className="btn ghost" onClick={() => set({ imageData: null, imageUrl: null, imageFallback: null })}>הסרה</button>
              )}
            </div>
          </div>
        )}

        {d.type === 'hub' && (
          <label className="field">
            <span className="lbl">כתובת לשיתוף</span>
            <div className="slug-row" dir="ltr">
              <span className="slug-prefix">{`#${to(d.parentId ? hubPath(nodes, d.parentId) : '')}/`}</span>
              <input
                dir="ltr"
                value={d.slug ?? ''}
                onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                placeholder={slugify(d.title) || 'software'}
                maxLength={40}
              />
            </div>
            <span className="hint">באנגלית. ריק = לפי השם{node?.slug ? ' · שינוי ישבור קישורים ששותפו' : ''}.</span>
          </label>
        )}

        {d.type === 'hub' && (
          <label className="field">
            <span className="lbl">עונה (חלקי המשחק בפנים)</span>
            <select value={d.season ?? DEFAULT_SEASON} onChange={(e) => set({ season: +e.target.value })}>
              {SEASONS.map((s) => <option key={s.year} value={s.year}>{seasonLabel(s)}</option>)}
            </select>
          </label>
        )}

        {d.type === 'link' && parent && season.pieces.length > 1 && (
          <label className="field">
            <span className="lbl">חלק משחק</span>
            <select value={d.piece || ''} onChange={(e) => set({ piece: e.target.value || null })}>
              <option value="">אוטומטי (לסירוגין)</option>
              {season.pieces.map((k) => <option key={k} value={k}>{PIECES[k].he}</option>)}
            </select>
          </label>
        )}

        <label className="field">
          <span className="lbl">מי יכול לפתוח</span>
          <select value={d.visibility} onChange={(e) => set({ visibility: e.target.value as Visibility })}>
            {(Object.entries(VIS_LABEL) as [Visibility, string][]).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
          {effective !== d.visibility && <span className="hint">בפועל: {VIS_LABEL[effective]} (לפי הארגז שמעליו)</span>}
          {d.type === 'hub' && <span className="hint">חל גם על כל מה שבתוך הארגז.</span>}
        </label>

        {(canAddToHome(profile) || d.parentId) && <label className="field">
          <span className="lbl">נמצא בתוך</span>
          <select value={d.parentId ?? ''} onChange={(e) => set({ parentId: e.target.value || null })}>
            {(profile.role === 'mentor' || (canAddToHome(profile) && (isNew || d.type === 'link'))) && <option value="">דף הבית</option>}
            {targets.map((t) => <option key={t.id} value={t.id}>{t.path}</option>)}
          </select>
        </label>}

        {!isNew && (
          <div className="field">
            <span className="lbl">סדר</span>
            <div className="row-btns">
              <button type="button" className="btn" onClick={() => move(-1)}><ArrowRight size={16} aria-hidden /> מוקדם יותר</button>
              <button type="button" className="btn" onClick={() => move(1)}>מאוחר יותר <ArrowLeft size={16} aria-hidden /></button>
            </div>
          </div>
        )}

        {err && <p className="err" role="alert">{err}</p>}

        <footer>
          <button type="button" className="btn primary" disabled={busy} onClick={save}>{isNew ? 'הוספה' : 'שמירה'}</button>
          {node && canDeleteNode(profile, node) && <button type="button" className="btn danger" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={16} aria-hidden /> מחיקה</button>}
        </footer>
      </aside>
      {confirmDelete && node && (
        <Confirm danger title={`למחוק את "${node.title}"?`} ok="מחיקה"
          text={subtree.length ? `כולל ${subtree.length} פריטים שבתוכו.` : 'אי אפשר לבטל את המחיקה.'}
          onOk={remove} onClose={() => setConfirmDelete(false)} />
      )}
    </div>
  )
}

function LinkIcon({ kind }: { kind: LinkKind }) {
  const I = KIND_ICON[kind]
  return <I size={14} aria-hidden />
}
