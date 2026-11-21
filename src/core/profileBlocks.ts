/**
 * Profile blocks — contract 1.
 *
 * Every sub-system's <schema>.<fn>(p_user uuid) returns jsonb of this shape.
 * NeatSystem renders it itself (no sub-system code runs on the profile page),
 * so this parser is the whole safety net: whatever a sub-system returns —
 * a newer contract, a renamed column, garbage — it either becomes valid
 * blocks or a clear "not available", never a crash.
 *
 *   { "contract": 1,
 *     "title": "הכשרות",                  optional, defaults to the tab label
 *     "link": "/trainings/p/<id>",        optional, "open in system"
 *     "blocks": [
 *       { "kind": "stats",    "items": [{ "label": "הסמכות", "value": 12, "hint": "מתוך 40" }] },
 *       { "kind": "progress", "label": "לדרגה הבאה", "value": 3, "max": 5, "hint": "ניטמאסטר" },
 *       { "kind": "chips",    "title": "מלמד/ת", "items": [{ "label": "מחרטה", "tone": "ok" }] },
 *       { "kind": "list",     "title": "אחרונות", "items": [{ "title": "...", "meta": "...", "at": "2026-11-01T..." }] },
 *       { "kind": "text",     "text": "..." } ] }
 *
 * An empty "blocks" array means "nothing to show for this person" (the
 * section is hidden). Unknown kinds and malformed items are dropped.
 */
export const PROFILE_CONTRACT = 1

export type Tone = 'ok' | 'warn' | 'bad' | 'brand' | 'reward' | 'muted'
export type Block =
  | { kind: 'stats'; items: { label: string; value: string; hint?: string }[] }
  | { kind: 'progress'; label: string; value: number; max: number; hint?: string }
  | { kind: 'chips'; title?: string; items: { label: string; tone?: Tone }[] }
  | { kind: 'list'; title?: string; items: { title: string; meta?: string; at?: string }[] }
  | { kind: 'text'; text: string }

export type Parsed =
  | { ok: true; title?: string; link?: string; blocks: Block[]; dropped: number }
  | { ok: false; reason: 'contract' | 'shape' | 'error'; detail: string }

const MAX_ITEMS = 40
const str = (v: unknown, max = 200): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, MAX_ITEMS) : [])
const TONES = new Set<Tone>(['ok', 'warn', 'bad', 'brand', 'reward', 'muted'])
const isoOk = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v))
const linkOk = (v: unknown) => typeof v === 'string' && /^\/[a-z0-9/_\-.%?=&#]*$/i.test(v) && !v.startsWith('//')

function block(b: unknown): Block | null {
  const o = obj(b)
  if (!o) return null
  switch (o.kind) {
    case 'stats': {
      const items = arr(o.items).map(obj).filter(Boolean).map((i) => ({ label: str(i!.label, 40), value: str(i!.value, 40), hint: str(i!.hint, 60) }))
        .flatMap((i) => (i.label && i.value !== undefined ? [{ label: i.label, value: i.value, hint: i.hint }] : []))
      return items.length ? { kind: 'stats', items } : null
    }
    case 'progress': {
      const value = Number(o.value), max = Number(o.max), label = str(o.label, 60)
      if (!label || !Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return null
      return { kind: 'progress', label, value: Math.max(0, Math.min(value, max)), max, hint: str(o.hint, 80) }
    }
    case 'chips': {
      const items = arr(o.items).map(obj).filter(Boolean).map((i) => ({ label: str(i!.label, 40), tone: TONES.has(i!.tone as Tone) ? (i!.tone as Tone) : undefined }))
        .flatMap((i) => (i.label ? [{ label: i.label, tone: i.tone }] : []))
      return items.length ? { kind: 'chips', title: str(o.title, 60), items } : null
    }
    case 'list': {
      const items = arr(o.items).map(obj).filter(Boolean).map((i) => ({ title: str(i!.title, 120), meta: str(i!.meta, 120), at: isoOk(i!.at) ? (i!.at as string) : undefined }))
        .flatMap((i) => (i.title ? [{ title: i.title, meta: i.meta, at: i.at }] : []))
      return items.length ? { kind: 'list', title: str(o.title, 60), items } : null
    }
    case 'text': {
      const text = str(o.text, 600)
      return text ? { kind: 'text', text } : null
    }
    default:
      return null
  }
}

export function parseProfile(raw: unknown): Parsed {
  const o = obj(raw)
  if (!o) return { ok: false, reason: 'shape', detail: 'התשובה אינה אובייקט' }
  if (typeof o.error === 'string') return { ok: false, reason: 'error', detail: str(o.detail, 200) ?? o.error }
  if (o.contract !== PROFILE_CONTRACT) return { ok: false, reason: 'contract', detail: `contract ${String(o.contract)}` }
  if (!Array.isArray(o.blocks)) return { ok: false, reason: 'shape', detail: 'חסר blocks' }
  const all = arr(o.blocks)
  const blocks = all.map(block).filter((b): b is Block => !!b)
  if (all.length > 0 && blocks.length === 0) return { ok: false, reason: 'shape', detail: 'אף בלוק לא תקין' }
  return { ok: true, title: str(o.title, 60), link: linkOk(o.link) ? (o.link as string) : undefined, blocks, dropped: all.length - blocks.length }
}
