import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { applyUi } from './lib/buddy'

const theme = (() => { try { return localStorage.getItem('mm-theme') } catch { return null } })()
if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
applyUi()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}))
}
