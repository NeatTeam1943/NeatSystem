import type { AuditEntry, Person, Position, Role, Team } from './api'
import { ACTION_LABEL, POSITION_LABEL, ROLE_LABEL, STATUS_LABEL, teamName } from './labels'

const FIELD: Record<string, string> = {
  full_name: 'שם', team: 'צוות', subteams: 'תתי-צוותים', position: 'תפקיד', grad_year: 'שנתון', is_admin: 'אדמין', status: 'סטטוס',
  nickname: 'כינוי', phone: 'טלפון', birth_date: 'תאריך לידה', fav_tool: 'כלי אהוב', avatar_url: 'תמונה', reason: 'סיבה',
}

/** Turns an audit row into Hebrew: "who · what · whom" + a details line. */
export function auditText(a: AuditEntry, people: Person[], teams: Team[], permLabel: (k: string) => string = (k) => k) {
  const val = (k: string, v: unknown): string => {
    if (v === null || v === undefined || v === '') return '—'
    if (Array.isArray(v)) return v.length ? v.map((x) => val(k, x)).join(', ') : '—'
    if (typeof v === 'boolean') return v ? 'כן' : 'לא'
    if (k === 'position') return POSITION_LABEL[v as Position] ?? String(v)
    if (k === 'status') return STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? String(v)
    if (k === 'team' || k === 'subteams') return teamName(teams, String(v))
    return String(v)
  }
  const target = a.target_type === 'user' ? people.find((p) => p.id === a.target_id)?.full_name ?? ''
    : a.target_type === 'role' ? ROLE_LABEL[a.target_id as Role] ?? a.target_id ?? '' : ''
  const parts: string[] = []
  for (const [k, v] of Object.entries(a.details ?? {})) {
    if (k === 'perm') parts.push(permLabel(String(v)))
    else if (k === 'fields' && Array.isArray(v)) { if (v.length) parts.push(`שינה/תה: ${v.map((f) => FIELD[f] ?? f).join(', ')}`) }
    else if (k === 'again') { if (v) parts.push('בקשה חוזרת') }
    else if (Array.isArray(v) && v.length === 2 && k !== 'subteams') parts.push(`${FIELD[k] ?? k}: ${val(k, v[0])} ← ${val(k, v[1])}`)
    else if (Array.isArray(v) && v.length === 2 && Array.isArray(v[0])) parts.push(`${FIELD[k] ?? k}: ${val(k, v[0])} ← ${val(k, v[1])}`)
    else if (v !== null && v !== undefined) parts.push(`${FIELD[k] ?? k}: ${val(k, v)}`)
  }
  return { who: a.actor_name ?? 'מערכת', what: ACTION_LABEL[a.action] ?? a.action, target, details: parts.join(' · ') }
}
