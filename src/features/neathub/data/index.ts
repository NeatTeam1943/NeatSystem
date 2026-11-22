import { api } from '@/core/api'
import { memoryNeathubRepository, type MemoryContext } from './memory'
import { supabaseNeathubRepository } from './supabase'
import type { NeathubRepository } from './repository'

export { DeniedError, type NeathubRepository } from './repository'

let previewContext: MemoryContext | null = null
let repo: NeathubRepository | null = null
let memory: ReturnType<typeof memoryNeathubRepository> | null = null

/**
 * The repository for this app: Supabase when there is a project, otherwise the
 * preview's in-memory one (which asks `previewContext` who is signed in).
 * One per page, so every screen sees the same data.
 */
export function neathubRepository(preview: MemoryContext): NeathubRepository {
  previewContext = preview
  return (repo ??= api.client
    ? supabaseNeathubRepository(api.client)
    : (memory = memoryNeathubRepository(() => previewContext!)))
}

/** The preview's archive snapshot (null before NEATHUB has loaded this session). */
export const previewSnapshot = (user: string) => memory?.snapshot(user) ?? null
