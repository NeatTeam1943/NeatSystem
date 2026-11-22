import { Blocks, Users, type LucideIcon } from 'lucide-react'
import type { Permission } from './api'
import type { Feature } from './feature'

/**
 * Permissions grouped by the feature that declares them: core's own first,
 * then every feature in sidebar order. Each feature defines its keys and what
 * they mean in its own migration; the permissions page only hands them out.
 */
export function permSections(perms: Permission[], features: readonly Feature[]): { module: string; label: string; icon: LucideIcon; perms: Permission[] }[] {
  const nav = (id: string) => features.find((f) => f.id === id)?.nav?.[0]
  const order = (m: string) => (m === 'core' ? -1 : nav(m)?.order ?? 999)
  const mods = [...new Set(perms.map((p) => p.module))].sort((a, b) => order(a) - order(b))
  return mods.map((m) => {
    const list = perms.filter((p) => p.module === m).sort((a, b) => a.sort - b.sort)
    return { module: m, label: m === 'core' ? 'NeatSystem' : nav(m)?.label ?? list[0]?.grp ?? m, icon: m === 'core' ? Users : nav(m)?.icon ?? Blocks, perms: list }
  })
}
