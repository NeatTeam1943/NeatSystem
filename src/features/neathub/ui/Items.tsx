import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { drawPiece, type Season } from '../domain/seasons'
import type { HubNode } from '../domain/types'
import { imgSrcProps } from './images'

/** What a tote, piece or cube needs to draw its label (the editor previews unsaved nodes). */
export type Labelled = Pick<HubNode, 'id' | 'title' | 'labelMode' | 'labelText' | 'imageData' | 'imageUrl' | 'imageFallback'>
/** A child shown rising out of an open tote, as the game piece it is drawn as. */
export interface Peek { node: HubNode; key: string }

const imgOf = (n: Labelled) => n.imageData || n.imageUrl || null
const modeOf = (n: Labelled) => (imgOf(n) ? n.labelMode || 'both' : 'txt')
const textOf = (n: Labelled) => (n.labelText ?? '').trim() || n.title

// ---------------------------------------------------------------- FitLabel
// Image and/or text centred in a fixed box. The text is shrunk (and, as a last
// resort, broken inside words) until everything fits fully inside the box.
// Wide boxes put the image beside the text; tall boxes stack them.
export function FitLabel({ node, tone = 'l', style, max = 16, min = 8 }: { node: Labelled; tone?: 'l' | 'd'; style?: CSSProperties; max?: number; min?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const img = imgOf(node)
  const mode = modeOf(node)
  const text = textOf(node)

  useLayoutEffect(() => {
    const box = ref.current
    if (!box) return
    const fit = () => {
      const W = box.clientWidth
      const H = box.clientHeight
      if (!W || !H) return
      const inner = box.firstChild as HTMLElement
      const im = inner.querySelector('img')
      const tx = inner.querySelector<HTMLElement>('.ft')
      const row = mode === 'both' && W / H > 1.45
      inner.classList.toggle('row', row)
      let imgSize = 0
      if (im) {
        imgSize = mode === 'img' ? Math.min(W, H) * 0.92 : row ? Math.min(H * 0.92, W * 0.36) : Math.min(H * 0.5, W * 0.62)
        im.style.width = im.style.height = `${Math.floor(imgSize)}px`
      }
      if (!tx) return
      const fits = () => inner.offsetHeight <= H + 0.5 && inner.offsetWidth <= W + 0.5 && tx.scrollWidth <= tx.clientWidth + 0.5
      const shrinkText = () => {
        for (let fs = max; fs >= min; fs -= 0.5) {
          tx.style.fontSize = `${fs}px`
          if (fits()) return true
        }
        return false
      }
      tx.classList.remove('clamp')
      tx.style.overflowWrap = 'normal'
      if (shrinkText()) return
      tx.style.overflowWrap = 'anywhere' // a single very long word
      if (shrinkText()) return
      while (im && imgSize > 14) { // give the text more room
        imgSize *= 0.85
        im.style.width = im.style.height = `${Math.floor(imgSize)}px`
        if (fits()) return
      }
      tx.classList.add('clamp') // last resort: cut with an ellipsis
    }
    fit()
    void document.fonts?.ready.then(fit)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null
    ro?.observe(box)
    return () => ro?.disconnect()
  }, [img, mode, text, max, min])

  return (
    <div ref={ref} className={`fitbox ${tone === 'd' ? 'd' : 'l'}`} style={style}>
      <div className="fi">
        {mode !== 'txt' && <img key={img} {...imgSrcProps(node)} alt="" draggable="false" />}
        {mode !== 'img' && <span className="ft">{text}</span>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Tote (hub)
// Where peek item i (of n) sits. Items fill rows of up to 3, front row lowest;
// each row behind rises higher. Positions are in tote units (front face = 140×80).
function peekSlot(i: number, n: number): CSSProperties {
  // Rows of at most 3 — wider rows cross the tote's side walls, which breaks 3D layering.
  const perRow = Math.min(3, n)
  const size = n > 6 ? 46 : 54
  const r = Math.floor(i / perRow)
  const rows = Math.ceil(n / perRow)
  const inRow = Math.min(perRow, n - r * perRow)
  const col = i - r * perRow
  const x = 70 + (col - (inRow - 1) / 2) * size * 0.92
  const restTop = 80 - size // resting inside the tote
  const finalTop = -size * 1.3 - r * size * 0.62
  return {
    width: size, height: size, left: x - size / 2, top: restTop, zIndex: rows - r,
    '--i': i, '--up': `${finalTop - restTop}px`,
  } as CSSProperties
}

function LidTop({ hole }: { hole: number }) {
  return (
    <div className="fic lidtop">
      <div className="kn" style={{ left: '8%' }} />
      <div className="kn" style={{ left: '30%' }} />
      <div className="kn" style={{ left: '62%' }} />
      <div className="kn" style={{ left: '84%' }} />
      <div className="pad" style={{ left: 9 }} />
      <div className="pad" style={{ right: 9 }} />
      <div className="rec" />
      <div className="hole" style={{ left: `${hole}%` }} />
    </div>
  )
}

export function Tote({ node, season, peek }: { node: Labelled; season: Season | null; peek?: Peek[] | null }) {
  return (
    <div className="tote">
      <div className="fc bt" />
      <div className="fc bk" />
      {!!peek?.length && (
        <div className="peek" aria-hidden="true">
          {peek.map(({ node: kid, key }, i) => (
            <div key={kid.id} className="pk" style={peekSlot(i, peek.length)}>
              <Piece node={kid} pieceKey={key} max={11} min={4.5} />
            </div>
          ))}
        </div>
      )}
      <div className="fc lf"><div className="hd" /></div>
      <div className="fc rt"><div className="hd" /></div>
      <div className="fc fr">
        <div className="tab" style={{ left: 26 }} />
        <div className="tab" style={{ left: 101 }} />
        <FitLabel node={node} tone="l" max={14} min={7} style={{ left: 18, top: 19, width: 104, height: 44 }} />
        {season && <small className="tote-yr">{season.label || season.year}</small>}
      </div>
      <div className="fl fb">
        <div className="face"><LidTop hole={30} /></div>
        <div className="face flip"><div className="fic under" /></div>
      </div>
      <div className="fl ff">
        <div className="face flip"><LidTop hole={50} /></div>
        <div className="face"><div className="fic under" /></div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Piece (link inside a hub)
export function Piece({ node, pieceKey, max, min }: { node: Labelled; pieceKey: string; max?: number; min?: number }) {
  const p = drawPiece(pieceKey)
  const b = p.box
  return (
    <>
      <div className="piece-svg" dangerouslySetInnerHTML={{ __html: p.svg }} />
      <FitLabel
        node={node}
        tone={p.tone}
        max={max ?? 16}
        min={min ?? 8}
        style={{ left: `${b.x - b.w / 2}%`, top: `${b.y - b.h / 2}%`, width: `${b.w}%`, height: `${b.h}%` }}
      />
    </>
  )
}

// ---------------------------------------------------------------- Cube (link on the home page)
export function Cube({ node }: { node: Labelled }) {
  return (
    <div className="cube">
      <div className="cf c2" />
      <div className="cf c3" />
      <div className="cf c1">
        <FitLabel node={node} tone="l" max={14} min={7} style={{ inset: '9%' }} />
      </div>
    </div>
  )
}
