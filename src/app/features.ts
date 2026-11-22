import type { Feature } from '@/core/feature'
import { isMock } from '@/core/api'
import { registerMockPermissions } from '@/core/api/mockApi'
import { homeFeature } from '@/features/home'
import { inboxFeature } from '@/features/inbox'
import { peopleFeature } from '@/features/people'
import { trainingsFeature } from '@/features/trainings'
import { neathubFeature } from '@/features/neathub'
import { moneyFeature } from '@/features/money'
import { adminFeature } from '@/features/admin'

/**
 * Every feature of NeatSystem. Adding one = a folder under src/features/ that
 * exports a Feature, plus one line here. Order = order of inbox / search groups.
 */
export const FEATURES: readonly Feature[] = [
  homeFeature,
  inboxFeature,
  peopleFeature,
  trainingsFeature,
  neathubFeature,
  moneyFeature,
  adminFeature,
]

// the preview has no migrations: features' declared permissions join the table here
if (isMock) for (const f of FEATURES) if (f.permissions) registerMockPermissions(f.id, f.permissions)
