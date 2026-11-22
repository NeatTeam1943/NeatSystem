import type { TrainingsModel } from './model'
import type { TrainingsEvent } from './types'

/** One log event as a Hebrew sentence. */
export function describeEvent(M: TrainingsModel, e: TrainingsEvent, withName = true): string {
  const who = withName && e.user ? M.nameOf(e.user) : ''
  const item = M.item(e.item)?.name ?? e.text ?? ''
  const rk = (id: string | null) => M.rank(id)?.name ?? 'ללא דרגה'
  switch (e.type) {
    case 'note': return e.text ?? ''
    case 'granted': return `${who} הוסמך/ה ל${item}${e.early ? ' (פתיחה מוקדמת)' : ''}`.trim()
    case 'revoked': return `בוטלה ההסמכה ${who ? `של ${who} ` : ''}ל${item}`
    case 'teach_granted': return `${who} מלמד/ת מעכשיו ${item}`.trim()
    case 'teach_revoked': return `${who} כבר לא מלמד/ת ${item}`.trim()
    case 'joined': return `${who} צורף/ה ל${M.category(e.category)?.name ?? ''}`.trim()
    case 'deactivated': return `${who} סומן/ה כלא פעיל/ה`.trim()
    case 'reactivated': return `${who} חזר/ה לפעילות`.trim()
    case 'rank_auto': return e.item ? `${who} עודכן/ה אוטומטית ל${rk(e.item)}`.trim() : `הדרגה של ${who} בוטלה אוטומטית`
    case 'rank_set': return `הדרגה של ${who} נקבעה ידנית ל${rk(e.item)}`
    case 'auto_rank_on': return `${who} — דרגה אוטומטית`.trim()
    case 'promoted': return `${who} קודם/ה ל${rk(e.item)}`
    case 'item_created': return `נוסף פריט: ${item}`
    case 'item_renamed': return `${e.text} שונה ל${item}`
    case 'item_deleted': return `נמחק הפריט ${e.text}`
    case 'ladder_updated': return 'סולם הדרגות עודכן'
    case 'category_updated': return 'הגדרות הקטגוריה עודכנו'
    case 'category_created': return `נוצרה קטגוריה: ${e.text}`
    case 'approver_added': return `${who} מונה/תה למאשר/ת`.trim()
    case 'approver_removed': return `${who} הוסר/ה מהמאשרים`.trim()
    case 'lead_locked': return `העריכה של ${who} ננעלה`
    case 'lead_unlocked': return `העריכה של ${who} נפתחה`
    case 'log_cleared': return `היומן של ${who} נוקה (${e.text} רשומות)`
    case 'imported_firestore': return 'יובאו הנתונים מ-StudentTracker'
    case 'team_joined': return `${who} צורף/ה לצוות`.trim()
    default: return String(e.type ?? '').replace(/_/g, ' ')
  }
}
