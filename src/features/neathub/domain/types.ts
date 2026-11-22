/** Who may open a node. A node's effective visibility is the strictest of itself and every tote above it. */
export type Visibility = 'public' | 'members' | 'leads' | 'mentors'
/** A person's role in NEATHUB, from NeatSystem permissions (neathub.role() in 0003_neathub.sql). */
export type Role = 'guest' | 'member' | 'lead' | 'mentor'
export type LabelMode = 'txt' | 'img' | 'both'

/**
 * One item of the hub tree: a tote ('hub') or a link. The URL itself is not
 * here — it is fetched per link (neathub_api.url), so a locked link's URL
 * never reaches a browser that may not open it.
 */
export interface HubNode {
  id: string
  /** null = on the home page */
  parentId: string | null
  type: 'hub' | 'link'
  title: string
  labelMode: LabelMode
  /** the text printed on the tote / piece */
  labelText: string
  /** a small data: URL (resized in the browser) */
  imageData: string | null
  /** an external image (a site's or a Google app's icon) */
  imageUrl: string | null
  imageFallback?: string | null
  /** totes: which season's game pieces are inside */
  season: number | null
  /** totes: the path segment for shareable links (a-z, 0-9, '-') */
  slug?: string | null
  /** links: a specific game piece instead of the automatic one */
  piece: string | null
  visibility: Visibility
  effVis: Visibility
  /** the top-level tote it is in ('root' for links on the home page): what an edit permission covers */
  scope: string
  order: number
  createdBy?: string | null
}

/** The signed-in person as NEATHUB sees them. */
export interface Editor {
  uid: string
  role: Role
  /** top-level tote ids (and 'root' = the home page) a lead may edit */
  scopes: string[]
}

/** A row of the "who edits what" page. */
export interface HubUser {
  uid: string
  name: string
  email: string | null
  photo: string | null
  role: Role
  scopes: string[]
  createdAt: string | null
}

/** What NEATHUB says about a person on their profile (neathub_api.editor). */
export interface EditorSummary {
  role: Role
  scopes: { id: string; title: string }[]
}
