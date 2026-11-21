import { Box } from 'lucide-react'
import { registerMockPermissions, registerMockSnapshot } from '@/core/api/mockApi'
import { isMock } from '@/core/api'
import type { HubModule } from '@/core/module'
import { checkTab, isProblem, type LoadedTab, type TabProblem } from '@/core/tabs'
import { TabFrame, TabHomeCardFrame } from '@/shell/TabFrame'

/**
 * Sub-system tabs = git submodules under systems/<folder>, each exporting
 * systems/<folder>/neatsystem/tab.* (see src/core/tabs.ts). Found at build
 * time; each one is a separate lazy chunk, so a tab that throws while loading
 * is reported and skipped instead of taking the whole site down.
 */
const loaders = import.meta.glob('/systems/*/neatsystem/tab.{js,jsx,ts,tsx}')

export interface TabState { tabs: LoadedTab[]; problems: TabProblem[] }
export const TABS: TabState = { tabs: [], problems: [] }

const folderOf = (path: string) => path.split('/')[2]

export async function loadTabs(source: Record<string, () => Promise<unknown>> = loaders): Promise<TabState> {
  const entries = Object.entries(source)
  const results = await Promise.allSettled(entries.map(([, load]) => load()))
  const out: TabState = { tabs: [], problems: [] }
  const seen = new Set<string>()
  results.forEach((r, i) => {
    const folder = folderOf(entries[i][0])
    if (r.status === 'rejected') {
      out.problems.push({ folder, problem: `הטעינה נכשלה: ${(r.reason as Error)?.message ?? r.reason}` })
      return
    }
    const c = checkTab(folder, r.value)
    if (isProblem(c)) out.problems.push(c)
    else if (seen.has(c.tab.id)) out.problems.push({ folder, problem: `המזהה ${c.tab.id} כבר בשימוש` })
    else { seen.add(c.tab.id); out.tabs.push(c) }
  })
  out.tabs.sort((a, b) => (a.tab.order ?? 50) - (b.tab.order ?? 50))
  for (const p of out.problems) console.error(`[NeatSystem] tab systems/${p.folder}: ${p.problem}`)
  return out
}

/** Each tab becomes an ordinary shell module: one nav entry, one route subtree, optional home cards. */
export function tabModule({ folder, tab }: LoadedTab): HubModule {
  return {
    id: `tab:${tab.id}`,
    nav: [{
      to: `/${tab.id}`, label: tab.label, icon: tab.icon ?? Box, order: tab.order ?? 50, dock: tab.dock,
      visible: tab.visible ? (s) => { try { return tab.visible!({ me: s.me, can: s.can }) } catch { return false } } : undefined,
    }],
    routes: [{ path: `${tab.id}/*`, element: <TabFrame folder={folder} tab={tab} /> }],
    home: (tab.home ?? []).map((h) => ({
      id: `${tab.id}:${h.id}`, order: h.order, column: h.column,
      Component: () => <TabHomeCardFrame folder={folder} tab={tab} card={h} />,
    })),
  }
}

export async function installTabs(push: (m: HubModule) => void) {
  const state = await loadTabs()
  TABS.tabs = state.tabs
  TABS.problems = state.problems
  for (const t of state.tabs) {
    push(tabModule(t))
    if (isMock && t.tab.mock?.profile) registerMockSnapshot(t.tab.id, t.tab.mock.profile)
    if (isMock && t.tab.mock?.permissions) registerMockPermissions(t.tab.id, t.tab.mock.permissions)
  }
}
