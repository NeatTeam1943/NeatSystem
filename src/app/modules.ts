import type { HubModule } from '@/core/module'
import { homeModule } from '@/modules/home'
import { inboxModule } from '@/modules/inbox'
import { peopleModule } from '@/modules/people'
import { moneyModule } from '@/modules/money'
import { adminModule } from '@/modules/admin'

/**
 * Every sub-system of NeatHub. Adding one = writing its folder under
 * src/modules/<name> (with its own migration under supabase/migrations) and
 * adding it to this list. Order here = order of inbox / search groups.
 */
export const MODULES: HubModule[] = [
  homeModule,
  inboxModule,
  peopleModule,
  moneyModule,
  adminModule,
]
