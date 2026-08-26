import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from '@/components/Shell'
import { JobSheetOverlay } from '@/components/JobSheetOverlay'
import JobSheets from '@/pages/JobSheets'
import ConfirmedJobSheets from '@/pages/ConfirmedJobSheets'
import WipWorkOrders from '@/pages/WipWorkOrders'

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        {/*
          A job sheet is not a page of its own. It is a layer over the list, so it
          is a child route: the list keeps rendering underneath the overlay.
        */}
        <Route path="/" element={<JobSheets />}>
          <Route path="job-sheets/:id" element={<JobSheetOverlay />} />
        </Route>
        <Route path="confirmed" element={<ConfirmedJobSheets />} />
        <Route path="wip" element={<WipWorkOrders />} />
        <Route path="wip/:workOrderId" element={<WipWorkOrders />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
