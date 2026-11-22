import { Suspense, useEffect, useMemo } from 'react'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import Header from './components/layout/Header'
import Sidebar from './components/layout/Sidebar'
import TopNav from './components/layout/TopNav'
import Button from './components/ui/Button'
import { ErrorState, LoadingState } from './components/ui/PageState'
import { ToastProvider } from './components/ui/Toast'
import { APP_NAME } from './config'
import { useHashRoute } from './hooks/useHashRoute'
import { DEFAULT_PAGE_ID, PAGES } from './navigation'
import SignIn from './pages/SignIn'

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AuthGate />
      </ToastProvider>
    </AuthProvider>
  )
}

function AuthGate() {
  const { status, retry } = useAuth()

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <LoadingState title="Checking sign-in…" />
      </div>
    )
  }
  if (status === 'unreachable') {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-4">
        <ErrorState title="Cannot reach the SALTFINE server" error="Start the backend (npm run dev in backend/) and try again." />
        <Button variant="primary" onClick={retry}>
          Try again
        </Button>
      </div>
    )
  }
  if (status === 'signed-out') return <SignIn />
  return <Shell />
}

function Shell() {
  const { can } = useAuth()
  const pages = useMemo(() => PAGES.filter((p) => can(p.minRole ?? 'viewer')), [can])
  const pageIds = useMemo(() => pages.map((p) => p.id), [pages])
  const [route, navigate] = useHashRoute(pageIds, DEFAULT_PAGE_ID)
  const page = pages.find((item) => item.id === route) ?? pages[0]
  const Page = page.component

  useEffect(() => {
    document.title = `${page.label} · ${APP_NAME}`
  }, [page.label])

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-panel focus:px-3 focus:py-2 focus:text-sm focus:font-semibold"
      >
        Skip to content
      </a>

      {/* Wide screens (>= 1280px): fixed sidebar. Tablets: tab bar across the top. */}
      <Sidebar pages={pages} activeId={page.id} />

      <div className="flex min-h-dvh flex-col xl:pl-64">
        <TopNav pages={pages} activeId={page.id} />
        <Header title={page.label} connectedLabel={page.status} />

        <main id="main" className="flex-1 px-4 py-5 sm:px-5 lg:px-8 lg:py-7">
          <div className="mx-auto w-full max-w-[1480px]">
            <Suspense fallback={<LoadingState title="Loading page…" />}>
              <Page onNavigate={navigate} />
            </Suspense>
          </div>
        </main>
      </div>
    </>
  )
}
