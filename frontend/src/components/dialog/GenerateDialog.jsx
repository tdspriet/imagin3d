import React, { useCallback, useEffect, useState } from 'react'
import './GenerateDialog.css'

function GenerateDialog({ isOpen, onClose, onGenerate, isGenerating }) {
  const [prompt, setPrompt] = useState('')
  const [isMultiview, setIsMultiview] = useState(false)

  const handleClose = useCallback(() => {
    if (!isGenerating) {
      onClose?.()
    }
  }, [onClose, isGenerating])

  useEffect(() => {
    if (!isOpen) {
      setPrompt('')
      setIsMultiview(false)
      return
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isGenerating) {
        event.preventDefault()
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleClose, isGenerating])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (prompt.trim() && !isGenerating) {
      onGenerate(prompt.trim(), isMultiview)
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="generate-dialog" role="dialog" aria-modal="true">
      <div
        className="generate-dialog__backdrop"
        onClick={handleClose}
      />
      <div className="generate-dialog__content" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="generate-dialog__close"
          onClick={handleClose}
          aria-label="Close"
          disabled={isGenerating}
        >
          ×
        </button>

        <header className="generate-dialog__header">
          <h2>Generate 3D Model</h2>
          <p>Describe what you want to generate from your moodboard.</p>
        </header>

        <form onSubmit={handleSubmit} className="generate-dialog__form">
          <textarea
            className="generate-dialog__input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., A modern minimalist lamp inspired by the colors and shapes in my moodboard..."
            rows={4}
            disabled={isGenerating}
            autoFocus
            style={{ marginBottom: '1rem' }}
          />

          <div className="generate-dialog__option">
            <label className="generate-dialog__toggle">
              <input
                type="checkbox"
                className="generate-dialog__toggle-input"
                checked={isMultiview}
                onChange={(e) => setIsMultiview(e.target.checked)}
                disabled={isGenerating}
              />
              <div className="generate-dialog__toggle-track">
                <div className="generate-dialog__toggle-thumb"></div>
              </div>
              <span className="generate-dialog__toggle-label">Generate multiple views</span>
            </label>
          </div>

          <div className="generate-dialog__actions">
            <button
              type="button"
              className="generate-dialog__btn generate-dialog__btn--secondary"
              onClick={handleClose}
              disabled={isGenerating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="generate-dialog__btn generate-dialog__btn--primary"
              disabled={!prompt.trim() || isGenerating}
            >
              {isGenerating ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default GenerateDialog
