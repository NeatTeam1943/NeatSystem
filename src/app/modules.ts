import type { HubModule } from '@/core/module'
import { homeModule } from '@/modules/home'
import { inboxModule } from '@/modules/inbox'
import { peopleModule } from '@/modules/people'
import { moneyModule } from '@/modules/money'
import { adminModule } from '@/modules/admin'

/**
 * NeatSystem's own modules (people, permissions, home...). Sub-system tabs
 * (git submodules under systems/) are appended once at startup by
 * installTabs() in main.tsx, before the first render. Order here = order of
 * inbox / search groups.
 */
export const MODULES: HubModule[] = [
  homeModule,
  inboxModule,
  peopleModule,
  moneyModule,
  adminModule,
]
