import React from 'react'
import Topbar from './components/Topbar'
import Canvas from './components/Canvas'
import ProgressBar from './components/ProgressBar'
import ConfirmationBar from './components/ConfirmationBar'
import MasterPromptDialog from './components/dialog/MasterPromptDialog'
import ModelDialog from './components/dialog/ModelDialog'
import TrellisVersionSelect from './components/TrellisVersionSelect'
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
  const isGenerating = useMoodboardStore((state) => state.isGenerating)
  const progress = useMoodboardStore((state) => state.progress)
  const comparisonProgress = useMoodboardStore((state) => state.comparisonProgress)
  const comparisonResults = useMoodboardStore((state) => state.comparisonResults)
  const workspaces = useMoodboardStore((state) => state.workspaces)
  const setTrellisVersion = useMoodboardStore((state) => state.setTrellisVersion)

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
  const isComparative = mode === 'comparative'
  const showProgressBar = !isComparative
    && !awaitingWeightsConfirmation
    && !awaitingMasterPromptConfirmation
    && (progress.total > 0 || Boolean(progress.finishedAt))

  const renderComparativePane = (workspaceKey, label) => {
    const paneResult = comparisonResults[workspaceKey]
    const isActive = activeWorkspaceKey === workspaceKey
    const paneProgress = comparisonProgress[workspaceKey]
    const showPaneProgress = paneProgress.total > 0 || Boolean(paneProgress.finishedAt)
    const showStatus = paneResult.status !== 'idle' && Boolean(paneResult.message)
    const workspace = workspaces[workspaceKey]

    return (
      <section className={`app__pane${isActive ? ' app__pane--active' : ''}`} key={workspaceKey}>
        <header className="app__pane-header">
          <div className="app__pane-header-main">
            <div className="app__pane-header-top">
              <div className="app__pane-title">
                <h2>{label}</h2>
                <TrellisVersionSelect
                  compact
                  value={workspace.trellisVersion}
                  onChange={(version) => setTrellisVersion(version, workspaceKey)}
                  disabled={isGenerating}
                  workspaceLabel={`${label.toLowerCase()}`}
                />
              </div>
              {showStatus ? (
                <div className={`app__pane-status app__pane-status--${paneResult.status}`}>
                  <span>{paneResult.message}</span>
                  {typeof paneResult.score === 'number' ? <strong>{paneResult.score}%</strong> : null}
                </div>
              ) : null}
            </div>
            <ProgressBar
              current={paneProgress.current}
              total={paneProgress.total}
              stage={paneProgress.stage}
              startedAt={paneProgress.startedAt}
              finishedAt={paneProgress.finishedAt}
              lastElapsedMs={paneProgress.lastElapsedMs}
              isVisible={showPaneProgress}
              compact
            />
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
          startedAt={progress.startedAt}
          finishedAt={progress.finishedAt}
          lastElapsedMs={progress.lastElapsedMs}
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
          {renderComparativePane(WORKSPACE_KEYS.LEFT, 'Left Pane')}
          {renderComparativePane(WORKSPACE_KEYS.RIGHT, 'Right Pane')}
        </main>
      ) : (
        <Canvas workspaceKey={WORKSPACE_KEYS.SINGLE} isActive />
      )}
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
        isOpen={modelDialog.isOpen}
        onClose={closeModelDialog}
        mode={modelDialog.mode}
        modelUrl={modelDialog.modelUrl}
        models={modelDialog.models}
      />
    </div>
  )
}

export default App
