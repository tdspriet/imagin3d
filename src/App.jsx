import React from 'react'
import Topbar from './components/Topbar'
import Canvas from './components/Canvas'
import './App.css'

/**
 * Main App Component
 * Simple moodboard creator with drag-and-drop functionality
 */
function App() {
  return (
    <div className="app">
      <Topbar />
      <Canvas />
    </div>
  )
}

export default App
