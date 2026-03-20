import React from 'react'
import Topbar from './components/Topbar'
import Canvas from './components/Canvas'
import ProgressBar from './components/ProgressBar'
import ConfirmationBar from './components/ConfirmationBar'
import MasterPromptDialog from './components/dialog/MasterPromptDialog'
import ModelDialog from './components/dialog/ModelDialog'
import { WORKSPACE_KEYS, useMoodboardStore } from './store/moodboardStore'
import './App.css'

/**
 * Main App Component
 * Simple moodboard creator with drag-and-drop functionality
 */
function App() {
  const mode = useMoodboardStore((state) => state.mode)
  const activeWorkspaceKey = useMoodboardStore((state) => state.activeWorkspaceKey)
  const setActiveWorkspace = useMoodboardStore((state) => state.setActiveWorkspace)
  const enterComparativeMode = useMoodboardStore((state) => state.enterComparativeMode)
  const exitComparativeMode = useMoodboardStore((state) => state.exitComparativeMode)
  const isGenerating = useMoodboardStore((state) => state.isGenerating)
  const progress = useMoodboardStore((state) => state.progress)
  const comparisonResults = useMoodboardStore((state) => state.comparisonResults)

  // Weights state
  const awaitingWeightsConfirmation = useMoodboardStore((state) => state.awaitingWeightsConfirmation)
  const confirmWeights = useMoodboardStore((state) => state.confirmWeights)
  const cancelWeights = useMoodboardStore((state) => state.cancelWeights)
  
  // Master prompt state
  const awaitingMasterPromptConfirmation = useMoodboardStore((state) => state.awaitingMasterPromptConfirmation)
  const confirmMasterPrompt = useMoodboardStore((state) => state.confirmMasterPrompt)
  const cancelMasterPrompt = useMoodboardStore((state) => state.cancelMasterPrompt)
  const regenerateMasterPromptImage = useMoodboardStore((state) => state.regenerateMasterPromptImage)
  const editMasterPromptImage = useMoodboardStore((state) => state.editMasterPromptImage)
  const masterPromptData = useMoodboardStore((state) => state.masterPromptData)
  const masterPromptLoadingByPane = useMoodboardStore((state) => state.masterPromptLoadingByPane)

  // Model dialog state
  const modelDialog = useMoodboardStore((state) => state.modelDialog)
  const closeModelDialog = useMoodboardStore((state) => state.closeModelDialog)

  // Show progress bar when generating and not awaiting any confirmation
  const showProgressBar = isGenerating && !awaitingWeightsConfirmation && !awaitingMasterPromptConfirmation && progress.total > 0
  const isComparative = mode === 'comparative'

  const renderComparativePane = (workspaceKey, label, subtitle) => {
    const paneResult = comparisonResults[workspaceKey]
    const isActive = activeWorkspaceKey === workspaceKey

    return (
      <section className={`app__pane${isActive ? ' app__pane--active' : ''}`} key={workspaceKey}>
        <header className="app__pane-header">
          <div>
            <h2>{label}</h2>
            <p>{subtitle}</p>
          </div>
          <div className={`app__pane-status app__pane-status--${paneResult.status}`}>
            <span>{paneResult.message}</span>
            {typeof paneResult.score === 'number' ? <strong>{paneResult.score}%</strong> : null}
          </div>
        </header>
        <Canvas
          workspaceKey={workspaceKey}
          onActivate={() => setActiveWorkspace(workspaceKey)}
          isActive={isActive}
        />
      </section>
    )
  }

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
          isComparative={isComparative}
        />
      </header>
      {isComparative ? (
        <main className="app__split-view">
          {renderComparativePane(WORKSPACE_KEYS.LEFT, 'Left Pane', 'Baseline workspace')}
          {renderComparativePane(WORKSPACE_KEYS.RIGHT, 'Right Pane', 'Modified workspace')}
        </main>
      ) : (
        <Canvas workspaceKey={WORKSPACE_KEYS.SINGLE} isActive />
      )}
      <button
        type="button"
        className={`app__compare-toggle${isComparative ? ' app__compare-toggle--active' : ''}`}
        onClick={isComparative ? exitComparativeMode : enterComparativeMode}
        disabled={isGenerating}
      >
        <span className="app__compare-toggle-label">Comparative View</span>
        <span className="app__compare-toggle-caption">
          {isComparative ? 'Return to one workspace' : 'Duplicate the current workspace side by side'}
        </span>
      </button>
      <MasterPromptDialog
        isOpen={awaitingMasterPromptConfirmation}
        onClose={cancelMasterPrompt}
        onConfirm={confirmMasterPrompt}
        onRegenerate={regenerateMasterPromptImage}
        onSendEdit={editMasterPromptImage}
        data={masterPromptData}
        loadingByPane={masterPromptLoadingByPane}
      />
      <ModelDialog
        isOpen={!isComparative && modelDialog.isOpen}
        onClose={closeModelDialog}
        modelUrl={modelDialog.modelUrl}
      />
    </div>
  )
}

export default App
