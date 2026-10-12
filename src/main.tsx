import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Console API for demos and automation: window.bbTwin.store.set({ time: 1290 })
import { actions, store } from './state/store'
import { startFireDrill, startTour } from './lib/controllers'
declare global {
  interface Window {
    bbTwin: { store: typeof store; actions: typeof actions; startFireDrill: typeof startFireDrill; startTour: typeof startTour }
  }
}
window.bbTwin = { store, actions, startFireDrill, startTour }
