import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom'
import { isMock } from '@/core/api'
import { SessionProvider, useSession } from '@/core/session'
import { Shell } from '@/shell/Shell'
import { Archived, Login, Onboarding, Pending } from '@/shell/Gates'
import { DemoBar } from '@/shell/DemoBar'
import { Spinner, ToastProvider } from '@/ui'
import { MODULES } from './modules'

// Hash routing: GitHub Pages has no server-side fallback, and MoneyTeam uses
// the same approach. Login uses PKCE, whose ?code= lands in the query string,
// so it never fights the router over the '#'.
const router = createHashRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      ...MODULES.flatMap((m) => m.routes ?? []).map((r) => (r.path === '' ? { index: true, element: r.element } : r)),
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

function Gate() {
  const s = useSession()
  switch (s.state.kind) {
    case 'loading': return <Spinner />
    case 'signed_out': return <Login />
    case 'needs_profile': return <Onboarding user={s.state.user} previous={s.state.previous} />
    case 'pending': return <Pending me={s.state.me} />
    case 'archived': return <Archived me={s.state.me} />
    case 'active': return <RouterProvider router={router} />
  }
}

export function App() {
  return (
    <ToastProvider>
      <SessionProvider>
        <Gate />
        {isMock && <DemoBar />}
      </SessionProvider>
    </ToastProvider>
  )
}
