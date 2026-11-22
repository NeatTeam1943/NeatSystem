import type { SupabaseClient } from '@supabase/supabase-js'
import type { TrainingsState } from '../domain/types'
import type { TrainingsRepository } from './repository'

/** One read (trainings_api.state) and one RPC per action. */
export function supabaseTrainingsRepository(sb: SupabaseClient): TrainingsRepository {
  const api = () => sb.schema('trainings_api')
  return {
    async load() {
      const { data, error } = await api().rpc('state')
      if (error) throw new Error(error.message)
      return data as TrainingsState
    },
    async call(action, args) {
      const { data, error } = await api().rpc(action, args)
      if (error) throw new Error(error.message)
      return data
    },
  }
}
