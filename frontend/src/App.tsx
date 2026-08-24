import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from '@/components/Shell'
import Dashboard from '@/pages/Dashboard'
import JobSheetEditor from '@/pages/JobSheetEditor'
import ConfirmedJobSheets from '@/pages/ConfirmedJobSheets'
import WipWorkOrders from '@/pages/WipWorkOrders'

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="job-sheets/:id" element={<JobSheetEditor />} />
        <Route path="confirmed" element={<ConfirmedJobSheets />} />
        <Route path="wip" element={<WipWorkOrders />} />
        <Route path="wip/:workOrderId" element={<WipWorkOrders />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
