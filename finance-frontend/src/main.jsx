import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext'
import './index.css'

// Service worker powers OS-level push notifications. Only meaningful on
// HTTPS (or localhost in dev, which browsers treat as a secure context).
if ('serviceWorker' in navigator) {
  const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost'
  if (isSecure) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    })
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
)