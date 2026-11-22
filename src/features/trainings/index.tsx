import type { ReactNode } from 'react'
import { GraduationCap } from 'lucide-react'
import { isMock } from '@/core/api'
import { registerMockSnapshot } from '@/core/api/mockApi'
import type { Feature } from '@/core/feature'
import { previewSnapshot } from './data'
import { TrainingsProvider } from './ui/TrainingsContext'
import { HomeCard } from './ui/HomeCard'
import { ItemPage } from './ui/Item'
import { Main } from './ui/Main'
import { ManagePage } from './ui/Manage'
import { PersonPage } from './ui/Person'
import { ArchiveView, ProfileSection } from './ui/ProfileSection'
import './trainings.css'

/**
 * Trainings (formerly StudentTracker): certifications, ranks and their history
 * per category. Data lives in the `trainings` schema (0002_trainings.sql); the
 * UI reads it as one snapshot through the repository in ./data.
 */
const withData = (el: ReactNode) => <TrainingsProvider>{el}</TrainingsProvider>

if (isMock) registerMockSnapshot('trainings', previewSnapshot)

export const trainingsFeature: Feature = {
  id: 'trainings',
  nav: [{ to: '/trainings', label: 'הכשרות', icon: GraduationCap, order: 30, dock: 2 }],
  routes: [
    { path: 'trainings', element: withData(<Main />) },
    { path: 'trainings/p/:id', element: withData(<PersonPage />) },
    { path: 'trainings/m/:id', element: withData(<ItemPage />) },
    { path: 'trainings/manage', element: withData(<ManagePage />) },
  ],
  useSearch: () => [{ id: 'trainings', group: 'מערכות', label: 'הכשרות', sub: 'הסמכות ודרגות', to: '/trainings', icon: GraduationCap }],
  home: [{
    id: 'trainings:next', order: 40, column: 'main',
    Component: () => <TrainingsProvider quiet><HomeCard /></TrainingsProvider>,
  }],
  profile: [{
    id: 'trainings', order: 30,
    visible: (_, p) => p.status !== 'pending',
    Component: ({ person }) => <TrainingsProvider quiet><ProfileSection person={person} /></TrainingsProvider>,
  }],
  permissions: [
    { key: 'trainings.certify_all', label: 'הסמכה בכל קטגוריות ההכשרות', grp: 'הכשרות', sort: 1, roles: ['captain', 'mentor', 'admin'] },
    { key: 'trainings.edit_catalog', label: 'עריכת פריטים, עמודות וסולמות בכל הקטגוריות', grp: 'הכשרות', sort: 2, roles: ['captain', 'mentor', 'admin'] },
    { key: 'trainings.manage', label: 'ניהול הכשרות: מאשרים, נעילת רש"צים, הסמכות מיוחדות, ניקוי יומן', grp: 'הכשרות', sort: 3, roles: ['mentor'] },
  ],
  ArchiveView,
}
