import { Component, Suspense, useMemo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { api } from '@/core/api'
import { invalidate } from '@/core/data'
import { useSession } from '@/core/session'
import type { TabExport, TabHomeCard, TabHost } from '@/core/tabs'
import { HostContext } from '@/kit/host'
import { Button, Card, Spinner, useToast } from '@/ui'

/** A crash inside one tab stays inside that tab. */
export class TabBoundary extends Component<{ name: string; compact?: boolean; children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidCatch(err: Error) { console.error(`[NeatSystem] tab "${this.props.name}" crashed:`, err) }
  render() {
    if (!this.state.err) return this.props.children
    if (this.props.compact) return null
    return (
      <Card className="tabcrash">
        <div className="row top" style={{ gap: 12 }}>
          <AlertTriangle size={22} className="cd" aria-hidden />
          <div className="grow">
            <div className="w7">{this.props.name} לא נטען כרגע</div>
            <div className="foot c2">שאר המערכת ממשיכה לעבוד. אם זה חוזר — לספר למי שמתחזק את {this.props.name}.</div>
            <div className="foot cm" dir="ltr" style={{ textAlign: 'end', marginTop: 6 }}>{this.state.err.message}</div>
          </div>
          <Button size="sm" onClick={() => this.setState({ err: null })}>לנסות שוב</Button>
        </div>
      </Card>
    )
  }
}

function useTabHost(tab: TabExport): TabHost {
  const s = useSession()
  const toast = useToast()
  return useMemo<TabHost>(() => {
    const base = `/${tab.id}`
    return {
      contract: 1,
      mode: api.mode,
      tabId: tab.id,
      base,
      supabase: api.client,
      me: s.me,
      people: s.people,
      teams: s.teams,
      can: s.can,
      to: (p = '') => (p === '' || p === '/' ? base : `${base}${p.startsWith('/') ? p : `/${p}`}`),
      invalidate: () => invalidate(),
      toast: (text, opts) => toast(text, opts),
    }
  }, [tab.id, s.me, s.people, s.teams, s.can, toast])
}

export function TabFrame({ folder, tab }: { folder: string; tab: TabExport }) {
  const host = useTabHost(tab)
  const Root = tab.Root
  return (
    <div className="tabroot" data-sys={folder}>
      <TabBoundary name={tab.label}>
        <HostContext.Provider value={host}>
          <Suspense fallback={<Spinner />}><Root host={host} /></Suspense>
        </HostContext.Provider>
      </TabBoundary>
    </div>
  )
}

export function TabHomeCardFrame({ folder, tab, card }: { folder: string; tab: TabExport; card: TabHomeCard }) {
  const host = useTabHost(tab)
  const C = card.Component
  return (
    <div className="tabroot" data-sys={folder}>
      <TabBoundary name={tab.label} compact>
        <HostContext.Provider value={host}><C host={host} /></HostContext.Provider>
      </TabBoundary>
    </div>
  )
}
