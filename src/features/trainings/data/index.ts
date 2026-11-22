import { api } from '@/core/api'
import { memoryTrainingsRepository, type MemoryContext, type MemoryTrainingsRepository } from './memory'
import { supabaseTrainingsRepository } from './supabase'
import type { TrainingsRepository } from './repository'

export type { TrainingsActions, TrainingsAction, TrainingsRepository, TrainingsSnapshot, ItemPatch, CategoryPatch } from './repository'

let previewContext: MemoryContext | null = null
let repo: TrainingsRepository | null = null
let memory: MemoryTrainingsRepository | null = null

/**
 * The repository for this app: Supabase when there is a project, otherwise the
 * preview's in-memory one (which asks `previewContext` who is signed in).
 * One per page, so every screen sees the same data.
 */
export function trainingsRepository(preview: MemoryContext): TrainingsRepository {
  previewContext = preview
  return (repo ??= api.client
    ? supabaseTrainingsRepository(api.client)
    : (memory = memoryTrainingsRepository(() => previewContext!)))
}

/** The preview's archive snapshot (null before trainings has loaded this session). */
export const previewSnapshot = (user: string) => memory?.snapshot(user) ?? null
