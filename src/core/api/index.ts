import { makeMockApi } from './mockApi'
import { makeSupabaseApi } from './supabaseApi'
import type { Api } from './types'

export * from './types'

const env = import.meta.env
export const isMock = env.VITE_MOCK === '1' || !env.VITE_SUPABASE_URL

export const api: Api = isMock ? makeMockApi() : makeSupabaseApi(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
export const MONEYTEAM_URL: string = env.VITE_MONEYTEAM_URL || 'https://neatteam1943.github.io/MoneyTeam/'
