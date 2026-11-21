import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, X, type LucideIcon } from 'lucide-react'
import { useBack } from '@/core/nav'
import { initials } from '@/core/labels'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

/* ---------- Button ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'white' | 'tint' | 'ghost' | 'danger' | 'default'
  size?: 'sm' | 'lg'
  icon?: LucideIcon
  block?: boolean
  busy?: boolean
}
export function Button({ variant = 'default', size, icon: Icon, block, busy, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button type="button" className={cx('btn', variant !== 'default' && variant, size, block && 'block', className)} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : Icon && <Icon size={size === 'sm' ? 16 : 18} aria-hidden />}
      {children}
    </button>
  )
}
export function IconButton({ icon: Icon, label, count, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; count?: number }) {
  return (
    <button type="button" className="iconbtn" aria-label={label} title={label} {...rest}>
      <Icon size={20} aria-hidden />
      {!!count && <span className="count">{count}</span>}
    </button>
  )
}

/* ---------- Card ---------- */
export function Card({ mesh, className, children, title, more, ...rest }: { mesh?: 'blue' | 'orange' | 'violet' | 'dark'; title?: ReactNode; more?: ReactNode } & Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>) {
  return (
    <section className={cx('card', mesh && `mesh ${mesh}`, className)} {...rest}>
      {(title || more) && (
        <div className="cardhead">
          {title && <h2 className="h3">{title}</h2>}
          {more && <span className="more">{more}</span>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Badge({ tone, children }: { tone?: 'blue' | 'orange' | 'ok' | 'warn' | 'bad'; children: ReactNode }) {
  return <span className={cx('badge', tone)}>{children}</span>
}

/* ---------- Avatar ---------- */
const AV = ['#3d2bff', '#fc5115', '#6a5cff', '#c42e00', '#1c00ea', '#ff7a2e', '#8f84ff']
export function Avatar({ name, src, size = 40 }: { name: string; src?: string | null; size?: number }) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const a = AV[h % AV.length], b = AV[((h >>> 3) + 1) % AV.length]
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: `linear-gradient(135deg, ${a}, ${b})` }} aria-hidden>
      {src ? <img src={src} alt="" referrerPolicy="no-referrer" /> : initials(name)}
    </span>
  )
}

/* ---------- Tabs / chips ---------- */
export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode; icon?: LucideIcon; count?: number }[]; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map(({ id, label: l, icon: I, count }) => (
        <button key={id} role="tab" aria-selected={value === id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>
          {I && <I size={16} aria-hidden />}
          {l}
          {!!count && <span className="count">{count}</span>}
        </button>
      ))}
    </div>
  )
}
export function Chips<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[]; label: string }) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {items.map((i) => (
        <button key={i.id} role="radio" aria-checked={value === i.id} className={cx('chip', value === i.id && 'on')} onClick={() => onChange(i.id)}>{i.label}</button>
      ))}
    </div>
  )
}

/* ---------- Form ---------- */
export function Field({ label, hint, error, children, id }: { label: string; hint?: ReactNode; error?: string | null; children: (id: string) => ReactNode; id?: string }) {
  const auto = useId(); const fid = id ?? auto
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      {children(fid)}
      {error ? <span className="err" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input className="input" {...p} />
export const Select = ({ children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select className="input" {...p}>{children}</select>
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className="input" {...p} />
export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} title={label} className="switch" disabled={disabled} onClick={() => onChange(!on)} />
}

/* ---------- Sheet (bottom sheet on phones, dialog / side panel on desktop) ---------- */
export function Sheet({ title, onClose, children, footer, wide, side, sub }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; side?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const first = ref.current?.querySelector<HTMLElement>('input,select,textarea,button:not(.iconbtn)')
    first?.focus()
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; prev?.focus?.() }
  }, [onClose])
  return createPortal(
    <div className={cx('scrim', side && 'side')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={cx('sheet', wide && 'wide')} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="grab" />
        <div className="sheethead">
          <div className="grow">
            {sub && <div className="foot c2">{sub}</div>}
            <h2 className="h2">{title}</h2>
          </div>
          <IconButton icon={X} label="סגירה" onClick={onClose} />
        </div>
        {children}
        {footer && <div className="sheetfoot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ---------- Toasts ---------- */
type Toast = { id: number; text: ReactNode; bad?: boolean }
const ToastCtx = createContext<(text: ReactNode, opts?: { bad?: boolean }) => void>(() => {})
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([])
  const show = useCallback((text: ReactNode, opts: { bad?: boolean } = {}) => {
    const id = Date.now() + Math.random()
    setList((l) => [...l.slice(-2), { id, text, bad: opts.bad }])
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), opts.bad ? 6500 : 4000)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => <div key={t.id} className={cx('toast', t.bad && 'bad')}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

/** Runs a write and reports the result with a toast. Server messages are already in Hebrew. */
export function useRun() {
  const toast = useToast()
  return useCallback(async (fn: () => Promise<void>, ok?: ReactNode) => {
    try {
      await fn()
      if (ok) toast(ok)
      return true
    } catch (e) {
      toast((e as Error).message || 'משהו השתבש', { bad: true })
      return false
    }
  }, [toast])
}

/* ---------- Page bits ---------- */
export function PageHead({ title, sub, actions, back }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: { fallback: string; label: string } }) {
  const goBack = useBack()
  return (
    <>
      {back && (
        <button className="back" onClick={() => goBack(back.fallback)}>
          <ArrowRight size={16} aria-hidden />
          {back.label}
        </button>
      )}
      <div className="pagehead">
        <div>
          <h1 className="h1">{title}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
        {actions && <div className="acts">{actions}</div>}
      </div>
    </>
  )
}
export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ic"><Icon size={26} aria-hidden /></div>
      <div className="w7" style={{ color: 'var(--text)' }}>{title}</div>
      {children && <div className="foot" style={{ marginTop: 4 }}>{children}</div>}
    </div>
  )
}
export const Skeleton = ({ h = 58, n = 3 }: { h?: number; n?: number }) => (
  <div className="stack tight" aria-busy="true" aria-label="טוען">
    {Array.from({ length: n }, (_, i) => <div key={i} className="skel" style={{ height: h }} />)}
  </div>
)
export const Spinner = () => <div className="center"><div className="spinner" aria-label="טוען" /></div>
export { cx }
