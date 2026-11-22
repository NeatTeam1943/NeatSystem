import type { Column, TrainingsState } from '../domain/types'

export interface ItemPatch { name?: string; column?: string; desc?: string; after?: string | null }
export interface CategoryPatch { name?: string; item_noun?: string; item_noun_singular?: string; favorite_label?: string; columns?: Column[] }

/** Every action, with its arguments (= the trainings_api function of the same name). */
export interface TrainingsActions {
  grant: { p_user: string; p_item: string }
  revoke: { p_user: string; p_item: string }
  set_teach: { p_user: string; p_item: string; p_on: boolean }
  add_note: { p_user: string; p_cat: string; p_text: string }
  clear_log: { p_user: string }
  set_favorite: { p_user: string; p_cat: string; p_text: string }
  join: { p_user: string; p_cat: string }
  set_active: { p_user: string; p_cat: string; p_active: boolean }
  set_rank: { p_user: string; p_cat: string; p_rank: string | null }
  set_auto: { p_user: string; p_cat: string }
  set_requirement: { p_cat: string; p_rank: string; p_items: string[]; p_min_grade: number | null }
  add_item: { p_cat: string; p_column: string; p_name: string; p_after?: string | null }
  update_item: { p_item: string; p_patch: ItemPatch }
  delete_item: { p_item: string }
  update_category: { p_cat: string; p_patch: CategoryPatch }
  create_category: { p_name: string; p_team?: string | null }
  set_approver: { p_cat: string; p_user: string; p_on: boolean }
  set_locked: { p_cat: string; p_user: string; p_locked: boolean }
  set_access: { p_cat: string; p_user: string; p_on: boolean }
}
export type TrainingsAction = keyof TrainingsActions

/**
 * Where trainings data comes from. The database checks and logs every action
 * itself; errors come back as Hebrew messages.
 */
/** What the archive keeps of a person (trainings.snapshot in 0002_trainings.sql). */
export interface TrainingsSnapshot {
  certifications: { category: string; item: string; at: string; teaches: boolean }[]
  ranks: { category: string; rank: string; manual: boolean }[]
}

export interface TrainingsRepository {
  load(): Promise<TrainingsState>
  call<K extends TrainingsAction>(action: K, args: TrainingsActions[K]): Promise<unknown>
}
