import { Blocks, Users, type LucideIcon } from 'lucide-react'
import { TABS } from '@/app/tabs'
import type { Permission } from './api'

/**
 * Permissions grouped by the system that declares them: NeatSystem's own
 * first, then every tab in sidebar order. Each system defines its keys and
 * what they mean in its own repo (its migration); here they are only shown
 * and handed out.
 */
export function permSections(perms: Permission[]): { module: string; label: string; icon: LucideIcon; perms: Permission[] }[] {
  const order = ['core', ...TABS.tabs.map((t) => t.tab.id)]
  const mods = [...new Set(perms.map((p) => p.module))].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
  return mods.map((m) => {
    const tab = TABS.tabs.find((t) => t.tab.id === m)?.tab
    const list = perms.filter((p) => p.module === m).sort((a, b) => a.sort - b.sort)
    return { module: m, label: m === 'core' ? 'NeatSystem' : tab?.label ?? list[0]?.grp ?? m, icon: m === 'core' ? Users : tab?.icon ?? Blocks, perms: list }
  })
}
