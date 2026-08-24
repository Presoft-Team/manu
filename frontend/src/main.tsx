import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@/index.css'
import App from '@/App'
import { MesProvider } from '@/store/mes'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <MesProvider>
        <App />
      </MesProvider>
    </BrowserRouter>
  </StrictMode>,
)
