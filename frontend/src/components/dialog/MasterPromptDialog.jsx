import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { MdCheck, MdClose, MdRefresh, MdSend } from 'react-icons/md'
import './MasterPromptDialog.css'

function MasterPromptDialog({ 
  isOpen, 
  onClose, 
  onConfirm, 
  onRegenerate,
  onSendEdit,
  masterPrompt, 
  masterImage,
  referenceImages = [],
  isLoading = false,
}) {
  const [editablePrompt, setEditablePrompt] = useState(masterPrompt || '')
  const [editInstruction, setEditInstruction] = useState('')

  const handleClose = useCallback(() => {
    if (isLoading) return
    onClose?.()
  }, [isLoading, onClose])

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

  useEffect(() => {
    if (!isOpen) return
    setEditablePrompt(masterPrompt || '')
    setEditInstruction('')
  }, [isOpen, masterPrompt])

  const handleConfirm = () => {
    onConfirm?.(editablePrompt)
  }

  const handleRegenerate = () => {
    onRegenerate?.(editablePrompt)
  }

  const handleSendEdit = () => {
    onSendEdit?.(editInstruction)
  }

  const disableRegenerate = useMemo(() => {
    return isLoading || !editablePrompt.trim()
  }, [editablePrompt, isLoading])

  const disableSendEdit = useMemo(() => {
    return isLoading || !editInstruction.trim() || !masterImage
  }, [editInstruction, masterImage, isLoading])

  const disableConfirm = useMemo(() => {
    return isLoading || !masterImage
  }, [isLoading, masterImage])

  const stopEvent = (event) => {
    event.stopPropagation()
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="master-prompt-dialog" role="dialog" aria-modal="true">
      <div
        className="master-prompt-dialog__backdrop"
        onClick={() => {
          if (!isLoading) handleClose()
        }}
      />
      <div className="master-prompt-dialog__content" onClick={stopEvent}>
        <button
          type="button"
          className="master-prompt-dialog__close"
          onClick={handleClose}
          disabled={isLoading}
          aria-label="Close"
        >
          ×
        </button>

        <header className="master-prompt-dialog__header">
          <h2>Input Confirmation</h2>
          <p>Review the generated master image.</p>
        </header>

        <div className="master-prompt-dialog__body">
          <div className="master-prompt-dialog__prompt-row">
            <div className="master-prompt-dialog__prompt-container">
              <h3 className="master-prompt-dialog__prompt-label">Master Prompt</h3>
              <textarea
                className="master-prompt-dialog__prompt-input"
                value={editablePrompt}
                onChange={(event) => setEditablePrompt(event.target.value)}
                placeholder="Enter master prompt"
                rows={7}
                disabled={isLoading}
              />
            </div>

            {referenceImages.length > 0 && (
              <div className="master-prompt-dialog__references-block">
                <h3 className="master-prompt-dialog__prompt-label">References</h3>
                <div className="master-prompt-dialog__references">
                  {referenceImages.map((image, index) => (
                    <img
                      key={`${image}-${index}`}
                      src={image}
                      alt={`Reference ${index + 1}`}
                      className="master-prompt-dialog__reference-image"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            className="master-prompt-dialog__btn master-prompt-dialog__btn--regenerate"
            onClick={handleRegenerate}
            disabled={disableRegenerate}
          >
            <MdRefresh size={16} />
            Regenerate
          </button>

          <div className="master-prompt-dialog__image-wrapper">
            <h3 className="master-prompt-dialog__prompt-label">Master Image</h3>
            <div className={`master-prompt-dialog__image-container ${isLoading ? 'master-prompt-dialog__image-container--loading' : ''}`}>
              {masterImage ? (
                <img
                  src={masterImage}
                  alt="Master Image"
                  className="master-prompt-dialog__image"
                />
              ) : (
                <div className="master-prompt-dialog__image-placeholder">No image generated yet</div>
              )}
              {isLoading && (
                <div className="master-prompt-dialog__loading-overlay">
                  <span className="master-prompt-dialog__spinner" />
                </div>
              )}
            </div>
          </div>

          <div className="master-prompt-dialog__edit-row">
            <input
              type="text"
              className="master-prompt-dialog__edit-input"
              value={editInstruction}
              onChange={(event) => setEditInstruction(event.target.value)}
              placeholder="e.g. make it brighter"
              disabled={isLoading}
            />
            <button
              type="button"
              className="master-prompt-dialog__btn master-prompt-dialog__btn--edit"
              onClick={handleSendEdit}
              disabled={disableSendEdit}
            >
              <MdSend size={16} />
              Send Edit
            </button>
          </div>
        </div>

        <div className="master-prompt-dialog__actions">
          <button
            type="button"
            className="master-prompt-dialog__btn master-prompt-dialog__btn--secondary"
            onClick={handleClose}
            disabled={isLoading}
          >
            <MdClose size={16} />
            Cancel
          </button>
          <button
            type="button"
            className="master-prompt-dialog__btn master-prompt-dialog__btn--primary"
            onClick={handleConfirm}
            disabled={disableConfirm}
          >
            <MdCheck size={16} />
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

export default MasterPromptDialog
