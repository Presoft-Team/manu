import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from '@/components/Shell'
import { JobSheetOverlay } from '@/components/JobSheetOverlay'
import Dashboard from '@/pages/Dashboard'
import JobSheets from '@/pages/JobSheets'
import ConfirmedJobSheets from '@/pages/ConfirmedJobSheets'
import WipWorkOrders from '@/pages/WipWorkOrders'
import MasterData from '@/pages/MasterData'
import Quality from '@/pages/Quality'

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        {/* The dashboard is the landing screen: plant state before paperwork. */}
        <Route path="/" element={<Dashboard />} />

        {/*
          A job sheet is not a page of its own. It is a layer over the list, so it
          is a child route: the list keeps rendering underneath the overlay.
        */}
        <Route path="job-sheets" element={<JobSheets />}>
          <Route path=":id" element={<JobSheetOverlay />} />
        </Route>

        <Route path="master-data" element={<MasterData />} />
        <Route path="confirmed" element={<ConfirmedJobSheets />} />
        <Route path="wip" element={<WipWorkOrders />} />
        <Route path="wip/:workOrderId" element={<WipWorkOrders />} />
        <Route path="quality" element={<Quality />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
