import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Box, ExternalLink, Search as SearchIcon } from 'lucide-react'
import { ancestors, canView } from '../domain/model'
import { drawPiece, seasonOf, type Season } from '../domain/seasons'
import { norm } from '../domain/text'
import type { Editor, HubNode } from '../domain/types'
import { imgSrcProps } from './images'

interface Entry { node: HubNode; trail: HubNode[]; path: string; title: string; label: string; pathN: string; parentSeason: Season | null }

const MAX_RESULTS = 12

// Searches every item the viewer is allowed to open (effective visibility already
// includes the strictest tote above it, so contents of locked totes never show up).
export function Search({ nodes, editor, onPick }: { nodes: HubNode[]; editor: Editor; onPick: (n: HubNode) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState(0)
  const [expanded, setExpanded] = useState(false) // small screens: icon → field
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const index = useMemo((): Entry[] => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    return nodes
      .filter((n) => canView(editor, n.effVis))
      .map((n) => {
        const trail = ancestors(nodes, n.id).slice(0, -1)
        const parent = n.parentId ? byId.get(n.parentId) : undefined
        return {
          node: n,
          trail,
          path: trail.map((a) => a.title).join(' › '),
          title: norm(n.title),
          label: norm(n.labelText),
          pathN: norm(trail.map((a) => a.title).join(' ')),
          parentSeason: parent ? seasonOf(parent.season) : null,
        }
      })
  }, [nodes, editor])

  const results = useMemo(() => {
    const words = norm(q).split(' ').filter(Boolean)
    if (!words.length) return []
    const scored: [number, Entry][] = []
    for (const e of index) {
      const hay = `${e.title} ${e.label} ${e.pathN}`
      if (!words.every((w) => hay.includes(w))) continue
      const first = words[0]
      let score = 0
      if (e.title.startsWith(first) || e.label.startsWith(first)) score += 4
      if (words.every((w) => e.title.includes(w) || e.label.includes(w))) score += 3
      if (e.node.type === 'hub') score += 1
      score -= e.trail.length * 0.1
      scored.push([score, e])
    }
    return scored.sort((a, b) => b[0] - a[0]).slice(0, MAX_RESULTS).map(([, e]) => e)
  }, [q, index])

  useEffect(() => setSel(0), [q])

  // "/" focuses the search; clicking outside closes the results.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) {
        e.preventDefault()
        setExpanded(true)
        requestAnimationFrame(() => inputRef.current?.focus())
      }
    }
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) { setOpen(false); if (!q) setExpanded(false) }
    }
    addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown, true)
    return () => { removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown, true) }
  }, [q])

  const pick = (e: Entry | undefined) => {
    if (!e) return
    onPick(e.node)
    setOpen(false)
    setQ('')
    setExpanded(false)
    inputRef.current?.blur()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[sel]) }
    else if (e.key === 'Escape') { e.stopPropagation(); setQ(''); setOpen(false); setExpanded(false); inputRef.current?.blur() }
  }

  const showPanel = open && q.trim().length > 0

  return (
    <div ref={wrapRef} className={`search ${expanded ? 'expanded' : ''}`}>
      <button
        type="button"
        className="search-toggle"
        aria-label="חיפוש"
        onClick={() => { setExpanded(true); requestAnimationFrame(() => inputRef.current?.focus()) }}
      >
        <SearchIcon size={18} aria-hidden />
      </button>
      <div className="search-field">
        <SearchIcon size={18} aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={q}
          placeholder="חיפוש בהאב…"
          aria-label="חיפוש בהאב"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="search-results"
          aria-activedescendant={showPanel && results[sel] ? `sr-${results[sel].node.id}` : undefined}
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <kbd className="search-kbd" aria-hidden="true">/</kbd>
      </div>
      {showPanel && (
        <ul id="search-results" className="search-results" role="listbox">
          {results.length === 0 && <li className="search-empty">לא נמצא כלום. נסו מילה אחרת.</li>}
          {results.map((e, i) => (
            <li
              key={e.node.id}
              id={`sr-${e.node.id}`}
              role="option"
              aria-selected={i === sel}
              className={i === sel ? 'sel' : ''}
              onPointerEnter={() => setSel(i)}
              onPointerDown={(ev) => ev.preventDefault()}
              onClick={() => pick(e)}
            >
              <ResultIcon entry={e} />
              <div className="sr-text">
                <b>{e.node.title}</b>
                <span>{e.path || 'דף הבית'}</span>
              </div>
              <span className={`sr-kind ${e.node.type}`}>
                {e.node.type === 'hub' ? <Box size={14} aria-hidden /> : <ExternalLink size={14} aria-hidden />}
                {e.node.type === 'hub' ? 'ארגז' : 'קישור'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ResultIcon({ entry }: { entry: Entry }) {
  const n = entry.node
  const img = n.imageData || n.imageUrl
  if (img) return <span className="sr-icon"><img key={img} {...imgSrcProps(n)} alt="" /></span>
  const key = n.type === 'hub' ? 'hubTote' : entry.parentSeason ? n.piece || entry.parentSeason.pieces[0] : null
  if (!key) return <span className="sr-icon cube-icon" />
  return <span className="sr-icon" dangerouslySetInnerHTML={{ __html: drawPiece(key).svg }} />
}
