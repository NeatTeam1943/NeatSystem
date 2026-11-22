import type { SupabaseClient } from '@supabase/supabase-js'
import type { Editor, EditorSummary, HubNode, HubUser } from '../domain/types'
import { DeniedError, type NeathubRepository } from './repository'

/** One RPC per method, on the neathub_api schema. */
export function supabaseNeathubRepository(sb: SupabaseClient): NeathubRepository {
  const call = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
    const { data, error } = await sb.schema('neathub_api').rpc(fn, args)
    if (error) throw error.code === '42501' || /permission-denied/.test(error.message) ? new DeniedError(error.message) : new Error(error.message)
    return data as T
  }
  return {
    nodes: () => call<HubNode[]>('nodes'),
    me: () => call<Editor>('me'),
    url: (id) => call<string | null>('url', { p_id: id }),
    saveNodes: (nodes, urls = {}, grantScope = null) => call('save_nodes', { p_nodes: nodes, p_urls: urls, p_grant_scope: grantScope }),
    deleteNodes: (ids) => call('delete_nodes', { p_ids: ids }),
    users: () => call<HubUser[]>('users'),
    setScopes: (user, scopes) => call('set_scopes', { p_user: user, p_scopes: scopes }),
    editor: (user) => call<EditorSummary | null>('editor', { p_user: user }),
  }
}
