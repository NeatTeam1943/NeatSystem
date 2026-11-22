import type { Editor, EditorSummary, HubNode, HubUser } from '../domain/types'

/** NEATHUB's backend: the neathub_api functions of 0003_neathub.sql. */
export interface NeathubRepository {
  nodes(): Promise<HubNode[]>
  /** the signed-in person (role 'guest' when not an active member) */
  me(): Promise<Editor>
  /** a link's URL; throws DeniedError when the person may not open it */
  url(id: string): Promise<string | null>
  /** create/update nodes and the URLs that changed; grantScope = a new home-page tote a lead just made */
  saveNodes(nodes: HubNode[], urls?: Record<string, string>, grantScope?: string | null): Promise<void>
  deleteNodes(ids: string[]): Promise<void>
  /** mentors only: everyone with their role and scopes */
  users(): Promise<HubUser[]>
  setScopes(user: string, scopes: string[]): Promise<void>
  /** a person's role and the totes they edit, for their profile */
  editor(user: string): Promise<EditorSummary | null>
}

/** Not allowed (SQL errcode 42501). */
export class DeniedError extends Error {
  constructor(message = 'permission-denied') { super(message) }
}
