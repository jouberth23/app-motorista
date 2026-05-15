import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { PWAUpdatePrompt } from '@/components/common/PWAUpdatePrompt'
import { AuthProvider, useAuthContext } from '@/contexts/AuthContext'
import { AppShell } from '@/components/layout/AppShell'
import { AccessKeyPage } from '@/pages/AccessKey'
import { RegisterPage } from '@/pages/Register'
import { LoginPage } from '@/pages/Login'
import { DashboardPage } from '@/pages/Dashboard'
import { NewTripPage } from '@/pages/NewTrip'
import { TripsPage } from '@/pages/Trips'
import { TripDetailsPage } from '@/pages/TripDetails'
import { ApprovalsPage } from '@/pages/Approvals'
import { ReportsPage } from '@/pages/Reports'
import { DriversPage } from '@/pages/Drivers'
import { AuditPage } from '@/pages/Audit'
import { ProfilePage } from '@/pages/Profile'
import { SettingsPage } from '@/pages/Settings'
import { AdminDashboardPage } from '@/pages/admin/AdminDashboard'
import { AccessCodesPage } from '@/pages/admin/AccessCodes'
import { Loader2, Lock } from 'lucide-react'
import type { AppRole } from '@/types/enums'

// ── Helpers ─────────────────────────────────────────────────────────────────

function roleHome(role: AppRole | null): string {
  if (role === 'admin') return '/admin/dashboard'
  if (role === 'supervisor') return '/approvals'
  return '/dashboard'
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    </div>
  )
}

function UnauthorizedPage() {
  const { role } = useAuthContext()
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
      <div className="w-16 h-16 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center">
        <Lock className="h-7 w-7 text-destructive" />
      </div>
      <div>
        <h2 className="font-display text-xl font-bold mb-1">Acesso não autorizado</h2>
        <p className="text-sm text-muted-foreground">
          Você não tem permissão para acessar esta área.
        </p>
      </div>
      <Navigate to={roleHome(role)} replace />
    </div>
  )
}

// ── Guards ───────────────────────────────────────────────────────────────────

/** Blocks unauthenticated users → redirect to /login */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthContext()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** Blocks authenticated users from public pages → redirect to role home */
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuthContext()
  if (loading) return <LoadingScreen />
  if (user && role) return <Navigate to={roleHome(role)} replace />
  return <>{children}</>
}

/** Blocks users who don't have the required roles */
function RoleGuard({
  children,
  roles,
}: {
  children: React.ReactNode
  roles: AppRole[]
}) {
  const { role } = useAuthContext()
  if (!role || !roles.includes(role)) return <UnauthorizedPage />
  return <>{children}</>
}

// ── Routes ───────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Routes>
      {/* Public auth routes */}
      <Route path="/" element={<PublicRoute><AccessKeyPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

      {/* Protected app routes */}
      <Route
        path="/"
        element={<AuthGuard><AppShell /></AuthGuard>}
      >
        {/* ── Motorista ── */}
        <Route
          path="dashboard"
          element={
            <RoleGuard roles={['motorista']}>
              <DashboardPage />
            </RoleGuard>
          }
        />
        <Route
          path="trips/new"
          element={
            <RoleGuard roles={['motorista']}>
              <NewTripPage />
            </RoleGuard>
          }
        />

        {/* ── Shared trips ── */}
        <Route path="trips" element={<TripsPage />} />
        <Route path="trips/:id" element={<TripDetailsPage />} />

        {/* ── Supervisor + Admin ── */}
        <Route
          path="approvals"
          element={
            <RoleGuard roles={['supervisor', 'admin']}>
              <ApprovalsPage />
            </RoleGuard>
          }
        />
        <Route
          path="reports"
          element={
            <RoleGuard roles={['supervisor', 'admin']}>
              <ReportsPage />
            </RoleGuard>
          }
        />
        <Route
          path="drivers"
          element={
            <RoleGuard roles={['supervisor', 'admin']}>
              <DriversPage />
            </RoleGuard>
          }
        />
        <Route
          path="audit"
          element={
            <RoleGuard roles={['supervisor', 'admin']}>
              <AuditPage />
            </RoleGuard>
          }
        />

        {/* ── Admin-only ── */}
        <Route
          path="admin/dashboard"
          element={
            <RoleGuard roles={['admin']}>
              <AdminDashboardPage />
            </RoleGuard>
          }
        />
        <Route
          path="admin/access-codes"
          element={
            <RoleGuard roles={['admin']}>
              <AccessCodesPage />
            </RoleGuard>
          }
        />
        <Route
          path="settings"
          element={
            <RoleGuard roles={['admin']}>
              <SettingsPage />
            </RoleGuard>
          }
        />

        {/* ── All authenticated ── */}
        <Route path="profile" element={<ProfilePage />} />

        {/* Catch-all inside app: redirect to role home */}
        <Route path="*" element={<RoleHomeRedirect />} />
      </Route>

      {/* Global catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function RoleHomeRedirect() {
  const { role } = useAuthContext()
  return <Navigate to={roleHome(role)} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="top-right"
          theme="dark"
          richColors
          closeButton
          toastOptions={{
            style: {
              background: 'hsl(222 20% 8%)',
              border: '1px solid hsl(222 15% 16%)',
              color: 'hsl(210 20% 96%)',
            },
          }}
        />
        <PWAUpdatePrompt />
      </AuthProvider>
    </BrowserRouter>
  )
}
