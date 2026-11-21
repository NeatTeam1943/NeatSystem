import type { Person, Position, Role, Team } from './api'

export const POSITION_LABEL: Record<Position, string> = {
  rookie: 'רוקי', member: 'חבר/ת צוות', team_lead: 'רש"צ', captain: 'קפטן/ית', mentor: 'מנטור/ית',
}
export const ROLE_LABEL: Record<Role, string> = { ...POSITION_LABEL, admin: 'אדמין' }
export const POSITIONS: Position[] = ['rookie', 'member', 'team_lead', 'captain', 'mentor']
export const ROLES: Role[] = ['rookie', 'member', 'team_lead', 'captain', 'admin', 'mentor']
export const STATUS_LABEL = { pending: 'ממתין/ה לאישור', active: 'פעיל/ה', rejected: 'נדחה', archived: 'בארכיון' } as const

export const ACTION_LABEL: Record<string, string> = {
  'user.join_requested': 'ביקש/ה להצטרף',
  'user.approved': 'אישר/ה הצטרפות',
  'user.rejected': 'דחה/תה בקשת הצטרפות',
  'user.profile_edited': 'ערך/ה פרופיל',
  'user.membership_changed': 'שינה/תה פרטי חברות',
  'user.bootstrap_mentor': 'הוגדר/ה כמנטור/ית ראשון/ה',
  'perm.role_granted': 'הוסיף/ה הרשאה לתפקיד',
  'perm.role_revoked': 'הוריד/ה הרשאה מתפקיד',
  'perm.user_granted': 'נתן/ה הרשאה נוספת',
  'perm.user_revoked': 'הוריד/ה הרשאה נוספת',
  'user.archived': 'העביר/ה לארכיון',
  'user.restored': 'החזיר/ה מהארכיון',
}

/**
 * Israeli school year: starts Sep 1, so in Nov 2026 the class of 2027 is in 12th grade.
 * Returns 7..12, or null for graduates / unknown.
 */
export function gradeOf(gradYear: number | null, today = new Date()): number | null {
  if (!gradYear) return null
  const yearEnd = today.getMonth() >= 8 ? today.getFullYear() + 1 : today.getFullYear()
  const g = 12 - (gradYear - yearEnd)
  return g >= 7 && g <= 12 ? g : null
}
const GRADE_HE = ['', '', '', '', '', '', '', 'ז׳', 'ח׳', 'ט׳', 'י׳', 'י"א', 'י"ב']
export const gradeLabel = (g: number | null) => (g ? GRADE_HE[g] : '')
/** grad years that are in school right now, youngest first */
export function currentGradYears(today = new Date()): { year: number; grade: number }[] {
  const yearEnd = today.getMonth() >= 8 ? today.getFullYear() + 1 : today.getFullYear()
  return [7, 8, 9, 10, 11, 12].map((g) => ({ year: yearEnd + (12 - g), grade: g })).reverse()
}

export const teamName = (teams: Team[], id: string | null) => (id ? teams.find((t) => t.id === id)?.name ?? id : '')
export const displayName = (p: Pick<Person, 'full_name' | 'nickname'>) => p.full_name
export const firstName = (p: Pick<Person, 'full_name'>) => p.full_name.split(' ')[0]
export function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
}

export function positionText(p: Person, teams: Team[]) {
  if (!p.position) return STATUS_LABEL[p.status]
  const pos = POSITION_LABEL[p.position]
  const t = teamName(teams, p.team)
  return t && p.position !== 'mentor' ? `${pos} · ${t}` : pos
}
