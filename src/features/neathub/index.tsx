import { Boxes } from 'lucide-react'
import { isMock } from '@/core/api'
import { registerMockSnapshot } from '@/core/api/mockApi'
import type { Feature } from '@/core/feature'
import { previewSnapshot } from './data'
import { NeathubProvider } from './ui/NeathubContext'
import { HubPage } from './ui/HubPage'
import { ArchiveView, ProfileSection } from './ui/ProfileSection'
import './neathub.css'
import './tote.css'

/**
 * NEATHUB: the team's links as totes and game pieces. Data lives in the
 * `neathub` schema (0003_neathub.sql), read through the repository in ./data.
 * Every path under /neathub is one page: its home, a tote by its path
 * (/neathub/software/vision), or /neathub/admin ("who edits what").
 */
const page = <NeathubProvider><HubPage /></NeathubProvider>

if (isMock) registerMockSnapshot('neathub', previewSnapshot)

export const neathubFeature: Feature = {
  id: 'neathub',
  nav: [{ to: '/neathub', label: 'NEATHUB', icon: Boxes, order: 40, dock: 4 }],
  routes: [
    { path: 'neathub', element: page },
    { path: 'neathub/*', element: page },
  ],
  useSearch: () => [{ id: 'neathub', group: 'מערכות', label: 'NEATHUB', sub: 'הקישורים של הקבוצה', to: '/neathub', icon: Boxes }],
  profile: [{ id: 'neathub', order: 40, visible: (_, p) => p.status === 'active', Component: ProfileSection }],
  permissions: [
    { key: 'neathub.lead', label: 'עריכת ארגזים ב-NEATHUB (מה שמנטור סימן)', grp: 'NEATHUB', sort: 1, roles: ['team_lead', 'captain'] },
    { key: 'neathub.manage', label: 'ניהול NEATHUB: הכל, כולל מי עורך מה', grp: 'NEATHUB', sort: 2, roles: ['mentor', 'admin'] },
  ],
  ArchiveView,
}
