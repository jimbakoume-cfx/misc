/** @jsxRuntime automatic */

import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import './appTheme.css'
import { SuivixProvider, useSuivix } from './lib/suivix/context'
import { SuivixLayout } from './components/suivix/Layout'
import { Toaster } from './lib/shadcn/sonner'
import { ErrorBoundary } from './components/suivix/ErrorBoundary'
import Dossiers from './pages/Dossiers'
import DossierDetail from './pages/DossierDetail'
import Equipe from './pages/Equipe'
import TableauDeBord from './pages/TableauDeBord'
import Alertes from './pages/Alertes'
import Parametres from './pages/Parametres'
import Bienvenue from './pages/Bienvenue'
import ScanPointer from './pages/ScanPointer'
import SuiviClient from './pages/SuiviClient'
import Relances from './pages/Relances'
import Transmissions from './pages/Transmissions'

// The client tracking page is public. Otherwise, signed out shows the welcome screen whatever the URL,
// so a scanned /p/<reference> link resumes after sign-in.
function Shell() {
  const { signedIn } = useSuivix()
  const { pathname } = useLocation()
  if (pathname === '/suivi' || pathname.startsWith('/suivi/')) {
    return (
      <Routes>
        <Route path="/suivi" element={<SuiviClient />} />
        <Route path="/suivi/:reference" element={<SuiviClient />} />
      </Routes>
    )
  }
  if (!signedIn) return <Bienvenue />
  return (
    <SuivixLayout>
      <Routes>
        <Route path="/" element={<TableauDeBord />} />
        <Route path="/dossiers" element={<Dossiers />} />
        <Route path="/dossiers/:id" element={<DossierDetail />} />
        <Route path="/p/:reference" element={<ScanPointer />} />
        <Route path="/alertes" element={<Alertes />} />
        <Route path="/relances" element={<Relances />} />
        <Route path="/transmissions" element={<Transmissions />} />
        <Route path="/equipe" element={<Equipe />} />
        <Route path="/parametres" element={<Parametres />} />
        <Route path="/recherche" element={<Navigate to="/dossiers" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SuivixLayout>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <SuivixProvider>
        <Shell />
        <Toaster />
      </SuivixProvider>
    </ErrorBoundary>
  )
}
