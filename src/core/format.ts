const dtf = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long' })
const dtfY = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
const tf = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' })
const wd = new Intl.DateTimeFormat('he-IL', { weekday: 'long' })

export const fmtDay = (d: string | Date) => dtf.format(new Date(d))
export const fmtDate = (d: string | Date) => dtfY.format(new Date(d))
export const fmtTime = (d: string | Date) => tf.format(new Date(d))
export const fmtToday = (d = new Date()) => `${wd.format(d)}, ${dtf.format(d)}`

export function fmtAgo(d: string | Date, now = new Date()): string {
  const t = new Date(d)
  const min = Math.round((now.getTime() - t.getTime()) / 60000)
  if (min < 1) return 'עכשיו'
  if (min < 60) return `לפני ${min} דק׳`
  const h = Math.round(min / 60)
  if (h < 24) return h === 1 ? 'לפני שעה' : `לפני ${h} שעות`
  const days = Math.round(h / 24)
  if (days === 1) return 'אתמול'
  if (days < 7) return `לפני ${days} ימים`
  return fmtDay(t)
}

export function ageOn(birth: string, today = new Date()): number {
  const b = new Date(birth)
  let a = today.getFullYear() - b.getFullYear()
  if (today.getMonth() < b.getMonth() || (today.getMonth() === b.getMonth() && today.getDate() < b.getDate())) a--
  return a
}
export const todayMMDD = (d = new Date()) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
