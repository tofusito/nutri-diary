import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { handleTyping } from './lib/keyboard.js'
import './styles.css'

handleTyping()

createRoot(document.getElementById('root')).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // A deployed change has to reach a phone that never closes the app: check for
  // a new worker on every return to it, and reload once the new one is in
  // charge so the running page is not left on the previous build.
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !navigator.serviceWorker.controller) return
    reloading = true
    location.reload()
  })
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      if (!registration) return
      const check = () => { if (document.visibilityState === 'visible') registration.update?.().catch(() => {}) }
      document.addEventListener('visibilitychange', check)
      registration.waiting?.postMessage('skip-waiting')
      registration.addEventListener('updatefound', () => {
        registration.installing?.addEventListener('statechange', function () { if (this.state === 'installed') this.postMessage('skip-waiting') })
      })
    }).catch(() => {})
  })
}
