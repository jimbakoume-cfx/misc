/** @jsxRuntime automatic */

import { Routes, Route, Navigate } from 'react-router-dom'
import './appTheme.css'
import { SuivixProvider } from './lib/suivix/context'
import { SuivixLayout } from './components/suivix/Layout'
import { Toaster } from './lib/shadcn/sonner'
import Dossiers from './pages/Dossiers'
import DossierDetail from './pages/DossierDetail'
import AgentsView from './pages/AgentsView'
import Equipe from './pages/Equipe'
import TableauDeBord from './pages/TableauDeBord'
import Alertes from './pages/Alertes'
import KPI from './pages/KPI'
import AuditLog from './pages/AuditLog'
import Parametres from './pages/Parametres'

export default function App() {
  return (
    <SuivixProvider>
      <SuivixLayout>
        <Routes>
          <Route path="/" element={<TableauDeBord />} />
          <Route path="/dossiers" element={<Dossiers />} />
          <Route path="/dossiers/:id" element={<DossierDetail />} />
          <Route path="/agents" element={<AgentsView />} />
          <Route path="/recherche" element={<Navigate to="/dossiers" replace />} />
          <Route path="/alertes" element={<Alertes />} />
          <Route path="/dashboards" element={<Navigate to="/" replace />} />
          <Route path="/kpi" element={<KPI />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/equipe" element={<Equipe />} />
          <Route path="/parametres" element={<Parametres />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SuivixLayout>
      <Toaster />
    </SuivixProvider>
  )
}
