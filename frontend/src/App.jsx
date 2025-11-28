import React from 'react'
import Topbar from './components/Topbar'
import Canvas from './components/Canvas'
import ProgressBar from './components/ProgressBar'
import ConfirmationBar from './components/ConfirmationBar'
import { useMoodboardStore } from './store/moodboardStore'
import './App.css'

/**
 * Main App Component
 * Simple moodboard creator with drag-and-drop functionality
 */
function App() {
  const isGenerating = useMoodboardStore((state) => state.isGenerating)
  const progress = useMoodboardStore((state) => state.progress)
  const awaitingConfirmation = useMoodboardStore((state) => state.awaitingConfirmation)
  const confirmWeights = useMoodboardStore((state) => state.confirmWeights)
  const cancelWeights = useMoodboardStore((state) => state.cancelWeights)

  // Show progress bar only when generating and not awaiting confirmation
  const showProgressBar = isGenerating && !awaitingConfirmation && progress.total > 0

  return (
    <div className="app">
      <header className="app__header">
        <Topbar />
        <ProgressBar
          current={progress.current}
          total={progress.total}
          stage={progress.stage}
          isVisible={showProgressBar}
        />
        <ConfirmationBar
          isVisible={awaitingConfirmation}
          onConfirm={confirmWeights}
          onCancel={cancelWeights}
        />
      </header>
      <Canvas />
    </div>
  )
}

export default App
