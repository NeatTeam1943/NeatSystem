import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Boxes } from 'lucide-react'
import { invalidate } from '@/core/data'
import { useSession } from '@/core/session'
import { Empty, Spinner, useToast } from '@/ui'
import type { Editor, HubNode } from '../domain/types'
import { neathubRepository, type NeathubRepository } from '../data'

export interface Neathub {
  nodes: HubNode[]
  /** the signed-in person as NEATHUB sees them */
  editor: Editor
  repo: NeathubRepository
  /** reads nodes and the editor again (after a change) */
  reload: () => Promise<void>
  toast: (msg: string) => void
}

const Ctx = createContext<Neathub | null>(null)

/** NEATHUB's data for whatever is inside: the tree and who is looking at it. */
export function NeathubProvider({ children, quiet }: { children: ReactNode; quiet?: boolean }) {
  const s = useSession()
  const toast = useToast()
  const repo = neathubRepository({ me: s.me, people: s.people, can: s.can })
  const [state, setState] = useState<{ nodes: HubNode[]; editor: Editor } | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const reload = useCallback(async () => {
    try {
      const [nodes, editor] = await Promise.all([repo.nodes(), repo.me()])
      setState({ nodes, editor })
      setError(null)
      invalidate('archives:')
      invalidate('neathub:')
    } catch (e) { setError(e as Error) }
  }, [repo])
  // the person changed (preview persona switch, a permission change): ask again
  useEffect(() => { void reload() }, [reload, s.me.id, s.perms])

  const say = useCallback((m: string) => toast(m), [toast])
  const value = useMemo(() => (state ? { ...state, repo, reload, toast: say } : null), [state, repo, reload, say])
  if (error && !quiet) return <div className="page"><Empty icon={Boxes} title="לא הצלחתי לטעון את ההאב">{error.message}</Empty></div>
  if (!value) return quiet ? null : <Spinner />
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useNeathub(): Neathub {
  const v = useContext(Ctx)
  if (!v) throw new Error('useNeathub outside NeathubProvider')
  return v
}

/** A path inside NEATHUB ('' = its home page). */
export const to = (path = '') => (path ? `/neathub/${path}` : '/neathub')
