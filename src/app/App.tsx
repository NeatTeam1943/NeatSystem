import { createHashRouter, Navigate, RouterProvider, type RouteObject } from 'react-router-dom'
import { isMock } from '@/core/api'
import { FeaturesProvider, type Feature } from '@/core/feature'
import { FeatureScope } from '@/core/FeatureScope'
import { SessionProvider, useSession } from '@/core/session'
import { Shell } from '@/shell/Shell'
import { Archived, Login, Onboarding, Pending } from '@/shell/Gates'
import { DemoBar } from '@/shell/DemoBar'
import { Spinner, ToastProvider } from '@/ui'
import { FEATURES } from './features'

function routesOf(f: Feature): RouteObject[] {
  return (f.routes ?? []).map((r) => {
    const element = <FeatureScope id={f.id}>{r.element}</FeatureScope>
    return r.path === '' ? { index: true, element } : { path: r.path, element }
  })
}

// Hash routing: GitHub Pages has no server-side fallback. Login uses PKCE,
// whose ?code= lands in the query string, so it never fights the router.
const router = createHashRouter([
  {
    path: '/',
    element: <Shell />,
    children: [...FEATURES.flatMap(routesOf), { path: '*', element: <Navigate to="/" replace /> }],
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
    <FeaturesProvider value={FEATURES}>
      <ToastProvider>
        <SessionProvider>
          <Gate />
          {isMock && <DemoBar />}
        </SessionProvider>
      </ToastProvider>
    </FeaturesProvider>
  )
}
