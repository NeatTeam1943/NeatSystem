import type { Person } from '@/core/api'
import { canEditNode, canView, HOME } from '../domain/model'
import type { Editor, HubNode, Role } from '../domain/types'
import { DeniedError, type NeathubRepository } from './repository'
import { seedDemo } from './seed'

/** Who is asking, in the preview (NeatSystem's mock persona). */
export interface MemoryContext { me: Person; people: Person[]; can: (perm: string) => boolean }

/**
 * neathub.role(): the signed-in person's from their permissions; anyone else's
 * from the default role table (the preview only knows the signed-in person's).
 */
function roleOf(p: Person | undefined, can?: (perm: string) => boolean): Role {
  if (!p || p.status !== 'active') return 'guest'
  if (can) return can('neathub.manage') ? 'mentor' : can('neathub.lead') ? 'lead' : 'member'
  return p.position === 'mentor' || p.is_admin ? 'mentor' : p.position === 'team_lead' || p.position === 'captain' ? 'lead' : 'member'
}

interface Data { nodes: HubNode[]; urls: Record<string, string>; scopes: Record<string, string[]> }

/** The preview's backend: the same rules as neathub_api (0003_neathub.sql), on sample data, in memory. */
export function memoryNeathubRepository(ctx: () => MemoryContext): NeathubRepository & { snapshot(user: string): { edits: string[] } } {
  let S: Data | null = null
  const data = (): Data => {
    if (S) return S
    const { nodes, urls } = seedDemo()
    const people = ctx().people
    const lead = (team: string) => people.find((p) => p.position === 'team_lead' && p.team === team)?.id
    const scopes: Record<string, string[]> = {}
    const sw = lead('software'), build = lead('build')
    if (sw) scopes[sw] = ['sw']
    if (build) scopes[build] = ['build', HOME]
    return (S = { nodes, urls, scopes })
  }
  const me = (): Editor => {
    const c = ctx()
    return { uid: c.me.id, role: roleOf(c.me, c.can), scopes: data().scopes[c.me.id] ?? [] }
  }
  const wait = () => new Promise((r) => setTimeout(r, 80))
  const titleOf = (scope: string) => (scope === HOME ? 'דף הבית' : data().nodes.find((n) => n.id === scope)?.title ?? scope)

  return {
    async nodes() { return structuredClone(data().nodes) },
    async me() { return me() },
    async url(id) {
      await wait()
      const n = data().nodes.find((x) => x.id === id)
      if (!n) return null
      if (!canView(me(), n.effVis) && !canEditNode(me(), n)) throw new DeniedError()
      return data().urls[id] ?? null
    },
    async saveNodes(nodes, urls = {}, grantScope = null) {
      await wait()
      const e = me()
      if (e.role !== 'mentor' && e.role !== 'lead') throw new DeniedError()
      const d = data()
      if (grantScope) d.scopes[e.uid] = [...(d.scopes[e.uid] ?? []), grantScope]
      for (const n of nodes) {
        const i = d.nodes.findIndex((x) => x.id === n.id)
        if (i >= 0) d.nodes[i] = { ...n }
        else d.nodes.push({ ...n })
        if (n.type === 'link' && urls[n.id] !== undefined) d.urls[n.id] = urls[n.id]
      }
    },
    async deleteNodes(ids) {
      await wait()
      const d = data(), gone = new Set(ids)
      d.nodes = d.nodes.filter((n) => !gone.has(n.id))
      for (const id of ids) delete d.urls[id]
    },
    async users() {
      if (me().role !== 'mentor') throw new DeniedError('רק מנטורים')
      return ctx().people.filter((p) => p.status === 'active').map((p) => ({
        uid: p.id, name: p.full_name, email: p.email ?? null, photo: p.avatar_url ?? null,
        role: roleOf(p, p.id === ctx().me.id ? ctx().can : undefined), scopes: data().scopes[p.id] ?? [], createdAt: p.created_at ?? null,
      }))
    },
    async setScopes(user, scopes) {
      await wait()
      if (me().role !== 'mentor') throw new DeniedError('רק מנטורים')
      data().scopes[user] = [...scopes]
    },
    async editor(user) {
      const p = ctx().people.find((x) => x.id === user)
      return { role: roleOf(p, user === ctx().me.id ? ctx().can : undefined), scopes: (data().scopes[user] ?? []).map((id) => ({ id, title: titleOf(id) })) }
    },
    snapshot: (user) => ({ edits: (data().scopes[user] ?? []).map(titleOf) }),
  }
}
