import type { CSSProperties } from 'react'
import {
  Award, Box, Braces, Check, Code, Cog, Cpu, Factory, Hammer, Layers, Lock, PencilRuler, Rocket, Shapes, Star, Wrench, Zap, type LucideIcon,
} from 'lucide-react'
import type { Person } from '@/core/api'
import type { TrainingsModel } from '../domain/model'
import type { Item, ItemState, Rank } from '../domain/types'
import { useTrainings } from './TrainingsContext'
import teachPng from '../assets/teach.png'
import logoPng from '../assets/logo.png'

const badges = import.meta.glob<string>('../assets/badges/*.png', { eager: true, query: '?url', import: 'default' })
const wordmarks = import.meta.glob<string>('../assets/wordmarks/*.png', { eager: true, query: '?url', import: 'default' })
export const badgeOf = (r: Rank | null | undefined) => (r ? badges[`../assets/badges/${r.badge}.png`] : undefined)
export const wordmarkOf = (r: Rank | null | undefined) => (r ? wordmarks[`../assets/wordmarks/${r.wordmark}.png`] : undefined)
export const brand = { teach: teachPng, logo: logoPng }

/** A rank's badge (or an empty circle). */
export function RankMark({ rank, size = 40 }: { rank: Rank | null | undefined; size?: number }) {
  return rank ? <img src={badgeOf(rank)} alt={rank.name} title={rank.name} width={size} height={size} style={{ objectFit: 'contain', flex: 'none' }} />
    : <span style={{ width: size, height: size, flex: 'none', borderRadius: '50%', background: 'var(--bg-subtle)', display: 'inline-block' }} />
}

export const PASTELS: [string, string][] = [['#CDEFE0', '#1E6B4A'], ['#CBEEEC', '#12675F'], ['#D3E9F8', '#1F5F8B'], ['#D8DEFF', '#2E3AA8'], ['#E3DBFF', '#4B2BB8'], ['#EED8F7', '#6E2390'],
  ['#F9D9E8', '#9A2A5E'], ['#F9D6DC', '#9E2338'], ['#FBE0D0', '#8F3F12'], ['#FBEFC4', '#7A5A00'], ['#F1F3C2', '#5E6400'], ['#E2F2C8', '#3F6B12'], ['#F1E7D3', '#6B4F1D']]
const CAT_COLOR: Record<string, number> = { build: 12, software: 1, cad: 4 }
const ICONS: Record<string, LucideIcon> = { hammer: Hammer, wrench: Wrench, zap: Zap, factory: Factory, code: Code, cpu: Cpu, braces: Braces, rocket: Rocket, 'pencil-ruler': PencilRuler, shapes: Shapes, box: Box, layers: Layers, cog: Cog, award: Award, star: Star }
const LEVEL_ICONS: Record<string, string[]> = { build: ['wrench', 'hammer', 'zap', 'cog', 'factory', 'star'], software: ['code', 'cpu', 'braces', 'layers', 'rocket', 'star'], cad: ['pencil-ruler', 'shapes', 'box', 'layers', 'cog', 'star'] }
export const colorOf = (catId: string) => PASTELS[CAT_COLOR[catId] ?? 9]
export function iconOf(M: TrainingsModel, item: Item): LucideIcon {
  const name = item.icon ?? (LEVEL_ICONS[item.category] ?? ['award', 'star', 'cog', 'zap', 'rocket', 'star'])[Math.min(5, M.levelOf(item))]
  return ICONS[name] ?? Award
}

/** An item as a round node (map, lists). */
export function Node({ item, state = 'open', size = 64, label = true, early, onClick }: {
  item: Item; state?: ItemState; size?: number; label?: boolean; early?: boolean; onClick?: () => void
}) {
  const { M } = useTrainings()
  const [p0, p1] = colorOf(item.category)
  const I = state === 'locked' ? Lock : iconOf(M, item)
  const style = { width: size, height: size, '--p0': p0, '--p1': p1 } as CSSProperties
  return (
    <button type="button" className="nodewrap" onClick={onClick} style={{ width: size + 32 }} aria-label={`${item.name} · ${({ locked: 'נעול', open: 'פתוח ללמידה', held: 'מוסמך/ת' })[state]}`}>
      <span className={`node ${state}`} style={style}>
        <I size={Math.round(size * 0.44)} aria-hidden />
        {state === 'held' && <span className={`nbadge ${early ? 'early' : ''}`}>{early ? <Zap size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}</span>}
      </span>
      {label && <span className="nlabel">{item.name}</span>}
    </button>
  )
}

export function Progress({ value, max, warn }: { value: number; max: number; warn?: boolean }) {
  return <div className={`tprog${warn ? ' warn' : ''}`} role="progressbar" aria-valuenow={value} aria-valuemax={max}><i style={{ width: `${Math.min(100, (value / (max || 1)) * 100)}%` }} /></div>
}

/** The "teaches others" toggle (the deck's light-bulb icon). */
export function Teach({ on, edit, onChange, label }: { on: boolean; edit: boolean; onChange: () => void; label: string }) {
  if (!on && !edit) return <span className="teach" style={{ visibility: 'hidden' }} aria-hidden><img src={brand.teach} alt="" /></span>
  return <button type="button" className={`teach${on ? ' on' : ''}`} disabled={!edit} onClick={onChange} aria-pressed={!!on} aria-label={label} title={on ? 'מלמד/ת אחרים' : 'לא מלמד/ת'}><img src={brand.teach} alt="" /></button>
}

/** grant / revoke / teach with the right toast */
export function useGrant() {
  const { M, act } = useTrainings()
  return {
    grant: (uid: string, item: Item) => act('grant', { p_user: uid, p_item: item.id }, M.stateOf(uid, item) === 'locked' ? `${M.nameOf(uid)} הוסמך/ה ל${item.name} (פתיחה מוקדמת)` : `${M.nameOf(uid)} הוסמך/ה ל${item.name}`),
    revoke: (uid: string, item: Item) => act('revoke', { p_user: uid, p_item: item.id }, `ההסמכה ל${item.name} בוטלה`),
    teach: (uid: string, item: Item, on: boolean) => act('set_teach', { p_user: uid, p_item: item.id, p_on: on }, on ? `${M.nameOf(uid)} מלמד/ת ${item.name}` : null),
  }
}

const ROLE_HE: Record<string, string> = { member: 'חבר/ת צוות', team_lead: 'רש"צ', captain: 'קפטן/ית', mentor: 'מנטור/ית' }
export const roleLine = (M: TrainingsModel, u: Person) =>
  [...new Set([u.status === 'archived' ? 'עזב/ה את הקבוצה' : ROLE_HE[u.position ?? ''], M.gradeLabel(u)])].filter(Boolean).join(' · ')
export const fmtShort = (d: string) => new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
