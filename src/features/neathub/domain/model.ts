import type { Editor, HubNode, Role, Visibility } from './types'

/**
 * The hub tree and its permission rules. The SQL (neathub.can_view /
 * neathub.can_edit and neathub_api.save_nodes in 0003_neathub.sql) is what
 * enforces them; these mirror it so the UI only offers what will succeed.
 */
export const ROLE_RANK: Record<Role, number> = { guest: 0, member: 1, lead: 2, mentor: 3 }
export const VIS_RANK: Record<Visibility, number> = { public: 0, members: 1, leads: 2, mentors: 3 }
export const VIS_LABEL: Record<Visibility, string> = {
  public: 'ציבורי',
  members: 'חברי קבוצה',
  leads: 'ראשי צוותים ומנטורים',
  mentors: 'מנטורים בלבד',
}
export const ROLE_LABEL: Record<Role, string> = { guest: 'אורח/ת', member: 'חבר/ת קבוצה', lead: 'ראש צוות', mentor: 'מנטור/ית' }

/** The home page as an edit scope. */
export const HOME = 'root'

export const stricter = (a: Visibility, b: Visibility): Visibility => (VIS_RANK[a] >= VIS_RANK[b] ? a : b)
export const byOrder = (a: HubNode, b: HubNode) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title)

export function childrenOf(nodes: readonly HubNode[], parentId: string | null): HubNode[] {
  return nodes.filter((n) => (n.parentId ?? null) === parentId).sort(byOrder)
}

/** The node and every tote above it, from the home page down. */
export function ancestors(nodes: readonly HubNode[], id: string): HubNode[] {
  const map = new Map(nodes.map((n) => [n.id, n]))
  const out: HubNode[] = []
  let cur = map.get(id)
  while (cur) {
    out.unshift(cur)
    cur = cur.parentId ? map.get(cur.parentId) : undefined
  }
  return out
}

export function descendants(nodes: readonly HubNode[], id: string): HubNode[] {
  const out: HubNode[] = []
  const walk = (pid: string) => childrenOf(nodes, pid).forEach((c) => { out.push(c); walk(c.id) })
  walk(id)
  return out
}

// ---- permissions
// Mentors may do everything. A lead edits the top-level totes in their scopes
// (a tote = it and everything inside it, incl. its season); 'root' lets them
// add to the home page, edit the links on it and remove totes from it (if that
// tote is theirs too). A lead who creates a tote on the home page gets it.
export const canView = (e: Editor | null, vis: Visibility) => VIS_RANK[vis] <= ROLE_RANK[e?.role ?? 'guest']
const has = (e: Editor | null, scope: string) => !!e?.scopes.includes(scope)

export function canEditNode(e: Editor | null, node: HubNode | null) {
  if (!e || !node) return false
  return e.role === 'mentor' || (e.role === 'lead' && has(e, node.scope))
}
export const canAddToHome = (e: Editor | null) => e?.role === 'mentor' || (e?.role === 'lead' && has(e, HOME))
/** Shows the edit toggle at all. */
export const canEditAnything = (e: Editor | null) => e?.role === 'mentor' || (e?.role === 'lead' && e.scopes.length > 0)
/** Removing something from the home page needs the home-page permission too. */
export const canDeleteNode = (e: Editor | null, node: HubNode) =>
  canEditNode(e, node) && (e!.role === 'mentor' || !!node.parentId || has(e, HOME))

/**
 * Recomputes scope + effective visibility for `node` and its subtree after a change.
 * Returns the nodes whose derived fields changed (always including `node`).
 */
export function recomputeSubtree(nodes: readonly HubNode[], node: HubNode): HubNode[] {
  const all = nodes.filter((n) => n.id !== node.id).concat(node)
  const map = new Map(all.map((n) => [n.id, n]))
  const changed: HubNode[] = []
  const apply = (n: HubNode, parent: HubNode | null) => {
    const scope = parent ? parent.scope : n.type === 'hub' ? n.id : HOME
    const effVis = parent ? stricter(n.visibility, parent.effVis) : n.visibility
    const next = { ...n, scope, effVis }
    if (n === node || next.scope !== n.scope || next.effVis !== n.effVis) changed.push(next)
    map.set(n.id, next)
    childrenOf(all, n.id).forEach((c) => apply(map.get(c.id)!, next))
  }
  apply(node, node.parentId ? map.get(node.parentId) ?? null : null)
  return changed
}

// ---- shareable tote paths: /neathub/software/vision
// A tote's optional slug is unique among its siblings; a path segment matches
// a child tote by slug, or by id as a fallback.
export const RESERVED_SLUGS = ['admin', 'h']
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/

export function slugify(title: string) {
  return (title || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

export const segOf = (n: HubNode) => n.slug || n.id
export const hubPath = (nodes: readonly HubNode[], id: string) => ancestors(nodes, id).map((n) => encodeURIComponent(segOf(n))).join('/')

export function resolvePath(nodes: readonly HubNode[], segs: string[]): HubNode | null {
  let parent: string | null = null
  let cur: HubNode | null = null
  for (const seg of segs) {
    const kids: HubNode[] = childrenOf(nodes, parent).filter((n) => n.type === 'hub')
    cur = kids.find((n) => n.slug === seg) ?? kids.find((n) => n.id === seg) ?? null
    if (!cur) return null
    parent = cur.id
  }
  return cur
}

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
