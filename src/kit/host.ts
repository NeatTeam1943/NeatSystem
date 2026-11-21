import { createContext, useContext } from 'react'
import type { TabHost } from '@/core/tabs'

export const HostContext = createContext<TabHost | null>(null)

/** Inside a tab: the host NeatSystem gave it. */
export function useHost(): TabHost {
  const h = useContext(HostContext)
  if (!h) throw new Error('useHost() outside a NeatSystem tab')
  return h
}
