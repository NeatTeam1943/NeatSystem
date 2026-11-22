import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { GraduationCap } from 'lucide-react'
import type { Person } from '@/core/api'
import { invalidate } from '@/core/data'
import { useSession } from '@/core/session'
import { Empty, Spinner, useToast } from '@/ui'
import { TrainingsModel } from '../domain/model'
import type { TrainingsState } from '../domain/types'
import { trainingsRepository, type TrainingsActions, type TrainingsAction } from '../data'

export interface Trainings {
  M: TrainingsModel
  me: Person
  /** Runs one action, reloads, and reports it with a toast. Returns the action's result, or false if it failed. */
  act: <K extends TrainingsAction>(action: K, args: TrainingsActions[K], ok?: string | null) => Promise<unknown>
  reload: () => Promise<void>
}

const Ctx = createContext<Trainings | null>(null)
const REFRESH_AFTER_MS = 30_000

/** The trainings data for whatever is inside: one snapshot, the model built from it, and act(). */
export function TrainingsProvider({ children, quiet }: { children: ReactNode; quiet?: boolean }) {
  const s = useSession()
  const toast = useToast()
  const repo = trainingsRepository({ me: s.me, people: s.people, can: s.can })
  const [S, setS] = useState<TrainingsState | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const loadedAt = useRef(0)

  const reload = useCallback(async () => {
    try { setS(await repo.load()); setError(null); loadedAt.current = Date.now() } catch (e) { setError(e as Error) }
  }, [repo])
  useEffect(() => { void reload() }, [reload, s.me.id, s.perms])
  useEffect(() => {
    const onFocus = () => { if (Date.now() - loadedAt.current > REFRESH_AFTER_MS) void reload() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [reload])

  const M = useMemo(() => (S ? new TrainingsModel(S, s.people, s.me.id) : null), [S, s.people, s.me.id])
  const act = useCallback<Trainings['act']>(async (action, args, ok) => {
    try {
      const r = await repo.call(action, args)
      await reload()
      invalidate('archives:')
      if (ok) toast(ok)
      return r ?? true
    } catch (e) {
      toast((e as Error).message || 'משהו השתבש', { bad: true })
      return false
    }
  }, [repo, reload, toast])

  const value = useMemo(() => (M ? { M, me: s.me, act, reload } : null), [M, s.me, act, reload])
  if (error && !quiet) {
    return <div className="page"><Empty icon={GraduationCap} title="ההכשרות לא נטענו">{error.message} · <button type="button" className="linkish" onClick={() => void reload()}>לנסות שוב</button></Empty></div>
  }
  if (!value) return quiet ? null : <Spinner />
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTrainings(): Trainings {
  const t = useContext(Ctx)
  if (!t) throw new Error('useTrainings outside TrainingsProvider')
  return t
}

/** A path inside the trainings feature. */
export const to = (path = '/') => `/trainings${path === '/' ? '' : path.startsWith('/?') ? path.slice(1) : path}`
