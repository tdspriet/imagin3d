import React from 'react'
import Topbar from './components/Topbar'
import Canvas from './components/Canvas'
import ProgressBar from './components/ProgressBar'
import ConfirmationBar from './components/ConfirmationBar'
import MasterPromptDialog from './components/dialog/MasterPromptDialog'
import ModelDialog from './components/dialog/ModelDialog'
import { useMoodboardStore } from './store/moodboardStore'
import './App.css'

/**
 * Main App Component
 * Simple moodboard creator with drag-and-drop functionality
 */
function App() {
  const isGenerating = useMoodboardStore((state) => state.isGenerating)
  const progress = useMoodboardStore((state) => state.progress)

  // Weights state
  const awaitingWeightsConfirmation = useMoodboardStore((state) => state.awaitingWeightsConfirmation)
  const confirmWeights = useMoodboardStore((state) => state.confirmWeights)
  const cancelWeights = useMoodboardStore((state) => state.cancelWeights)
  
  // Master prompt state
  const awaitingMasterPromptConfirmation = useMoodboardStore((state) => state.awaitingMasterPromptConfirmation)
  const confirmMasterPrompt = useMoodboardStore((state) => state.confirmMasterPrompt)
  const cancelMasterPrompt = useMoodboardStore((state) => state.cancelMasterPrompt)
  const masterPromptData = useMoodboardStore((state) => state.masterPromptData)

  // Model dialog state
  const modelDialog = useMoodboardStore((state) => state.modelDialog)
  const closeModelDialog = useMoodboardStore((state) => state.closeModelDialog)

  // Show progress bar when generating and not awaiting any confirmation
  const showProgressBar = isGenerating && !awaitingWeightsConfirmation && !awaitingMasterPromptConfirmation && progress.total > 0

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
          isVisible={awaitingWeightsConfirmation}
          onConfirm={confirmWeights}
          onCancel={cancelWeights}
        />
      </header>
      <Canvas />
      <MasterPromptDialog
        isOpen={awaitingMasterPromptConfirmation}
        onClose={cancelMasterPrompt}
        onConfirm={confirmMasterPrompt}
        masterPrompt={masterPromptData?.prompt}
        masterImage={masterPromptData?.image}
      />
      <ModelDialog
        isOpen={modelDialog.isOpen}
        onClose={closeModelDialog}
        modelUrl={modelDialog.modelUrl}
      />
    </div>
  )
}

export default App
