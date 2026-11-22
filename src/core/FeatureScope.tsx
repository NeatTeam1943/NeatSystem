import { createContext, useContext, type ReactNode } from 'react'

const ScopeCtx = createContext<string | null>(null)

/**
 * Wraps anything a feature renders (its routes, its home cards, its profile
 * section) so that feature's own CSS applies to it (scripts/scope-css.ts).
 * It adds no box of its own (display: contents).
 */
export function FeatureScope({ id, children }: { id: string; children: ReactNode }) {
  return <ScopeCtx.Provider value={id}><div data-feature={id} className="feature-root">{children}</div></ScopeCtx.Provider>
}

/**
 * For content rendered elsewhere in the page (a portal, e.g. a sheet): keeps
 * the feature scope it was opened from, so that feature's CSS still applies.
 */
export function KeepScope({ children }: { children: ReactNode }) {
  const id = useContext(ScopeCtx)
  return id ? <div data-feature={id} className="feature-root">{children}</div> : <>{children}</>
}
