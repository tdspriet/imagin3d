import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ABStudy from './ab/ABStudy.jsx'
import './index.css'

const root = ReactDOM.createRoot(document.getElementById('root'))

// Works whether the app is deployed at / or /imagin3d/ (the Vite base)
if (window.location.pathname.includes('/AB')) {
  root.render(<React.StrictMode><ABStudy /></React.StrictMode>)
} else {
  root.render(<React.StrictMode><App /></React.StrictMode>)
}
