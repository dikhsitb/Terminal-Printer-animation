import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import { PrinterAnimation } from './PrinterAnimation'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrinterAnimation />
    <Analytics />
  </StrictMode>,
)
