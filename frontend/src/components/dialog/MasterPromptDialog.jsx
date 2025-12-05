import React, { useCallback, useEffect } from 'react'
import './MasterPromptDialog.css'

function MasterPromptDialog({ 
  isOpen, 
  onClose, 
  onConfirm, 
  masterPrompt, 
  masterImage,
}) {
  const handleClose = useCallback(() => {
    onClose?.()
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleClose])

  const handleConfirm = () => {
    onConfirm?.()
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="master-prompt-dialog" role="dialog" aria-modal="true">
      <div
        className="master-prompt-dialog__backdrop"
        onClick={handleClose}
      />
      <div className="master-prompt-dialog__content" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="master-prompt-dialog__close"
          onClick={handleClose}
          aria-label="Close"
        >
          ×
        </button>

        <header className="master-prompt-dialog__header">
          <h2>Input Preview</h2>
          <p>Review the generated master prompt and master image.</p>
        </header>

        <div className="master-prompt-dialog__body">
          {masterImage && (
            <div className="master-prompt-dialog__image-container">
              <img 
                src={masterImage} 
                alt="Master Image" 
                className="master-prompt-dialog__image"
              />
            </div>
          )}
          
          {masterPrompt && (
            <div className="master-prompt-dialog__prompt-container">
              <h3 className="master-prompt-dialog__prompt-label">Master Prompt</h3>
              <div className="master-prompt-dialog__prompt-text">
                {masterPrompt}
              </div>
            </div>
          )}
        </div>

        <div className="master-prompt-dialog__actions">
          <button
            type="button"
            className="master-prompt-dialog__btn master-prompt-dialog__btn--secondary"
            onClick={handleClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="master-prompt-dialog__btn master-prompt-dialog__btn--primary"
            onClick={handleConfirm}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

export default MasterPromptDialog
