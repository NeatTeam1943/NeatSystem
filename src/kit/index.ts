/**
 * @neatsystem/kit — the one design kit every tab uses, so a sub-system looks
 * exactly like the rest of NeatSystem. Tabs import from here, never from
 * NeatSystem's internal paths. Adding exports is fine; removing or changing
 * one is a breaking change of the tab contract.
 */
export {
  Avatar, Badge, Button, Card, Chips, Empty, Field, IconButton, Input, PageHead, Select, Sheet, Skeleton, Spinner, Switch,
  Tabs, Textarea, useRun, useToast, cx,
} from '@/ui'
export { useHost, HostContext } from './host'
export { gradeOf, gradeLabel, POSITION_LABEL, teamName, firstName, positionText } from '@/core/labels'
export { fmtAgo, fmtDay, fmtDate } from '@/core/format'
export type { TabExport, TabHost, TabHomeCard } from '@/core/tabs'
export type { Person, Team, Position } from '@/core/api'
