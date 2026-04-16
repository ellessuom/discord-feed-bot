import { BrowserRouter, Routes, Route } from 'react-router'
import { AppLayout } from '@/components/layout/AppLayout'
import { Dashboard } from '@/pages/Dashboard'
import { SettingsPage } from '@/pages/Settings'
import { AddSourceModal } from '@/components/forms/AddSourceModal'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <AddSourceModal />
    </BrowserRouter>
  )
}

export default App
