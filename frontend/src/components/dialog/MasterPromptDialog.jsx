import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { MdCheck, MdClose, MdRefresh, MdSend } from 'react-icons/md'
import './MasterPromptDialog.css'

const COMPARATIVE_PANES = ['left', 'right']

function MasterPromptDialog({
  isOpen,
  onClose,
  onConfirm,
  onRegenerate,
  onSendEdit,
  data,
  loadingByPane = { single: false, left: false, right: false },
}) {
  const [editablePrompt, setEditablePrompt] = useState('')
  const [editInstruction, setEditInstruction] = useState('')
  const [comparativePrompts, setComparativePrompts] = useState({ left: '', right: '' })
  const [comparativeEdits, setComparativeEdits] = useState({ left: '', right: '' })

  const isComparative = data?.mode === 'comparative'
  const isLoading = useMemo(
    () => Object.values(loadingByPane || {}).some(Boolean),
    [loadingByPane]
  )

  const handleClose = useCallback(() => {
    if (!isLoading) {
      onClose?.()
    }
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
    if (!isOpen || !data) return

    if (data.mode === 'comparative') {
      setComparativePrompts({
        left: data.panes?.left?.prompt || '',
        right: data.panes?.right?.prompt || '',
      })
      setComparativeEdits({ left: '', right: '' })
      return
    }

    setEditablePrompt(data.prompt || '')
    setEditInstruction('')
  }, [data, isOpen])

  const stopEvent = (event) => {
    event.stopPropagation()
  }

  const renderReferenceImages = (referenceImages = []) => {
    if (!referenceImages.length) return null

    return (
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
    )
  }

  const renderSinglePane = () => {
    const disableRegenerate = isLoading || !editablePrompt.trim()
    const disableSendEdit = isLoading || !editInstruction.trim() || !data?.image
    const disableConfirm = isLoading || !data?.image

    return (
      <>
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
            {renderReferenceImages(data?.referenceImages || [])}
          </div>

          <button
            type="button"
            className="master-prompt-dialog__btn master-prompt-dialog__btn--regenerate"
            onClick={() => onRegenerate?.(editablePrompt)}
            disabled={disableRegenerate}
          >
            <MdRefresh size={16} />
            Regenerate
          </button>

          <div className="master-prompt-dialog__image-wrapper">
            <h3 className="master-prompt-dialog__prompt-label">Master Image</h3>
            <div className={`master-prompt-dialog__image-container ${loadingByPane.single ? 'master-prompt-dialog__image-container--loading' : ''}`}>
              {data?.image ? (
                <img src={data.image} alt="Master Image" className="master-prompt-dialog__image" />
              ) : (
                <div className="master-prompt-dialog__image-placeholder">No image generated yet</div>
              )}
              {loadingByPane.single && (
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
              onClick={() => onSendEdit?.(editInstruction)}
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
            onClick={() => onConfirm?.()}
            disabled={disableConfirm}
          >
            <MdCheck size={16} />
            Confirm
          </button>
        </div>
      </>
    )
  }

  const renderComparativePane = (pane) => {
    const paneData = data?.panes?.[pane]
    const isPaneLoading = Boolean(loadingByPane?.[pane])
    const disableRegenerate = isPaneLoading || !comparativePrompts[pane]?.trim()
    const disableSendEdit = isPaneLoading || !comparativeEdits[pane]?.trim() || !paneData?.image

    return (
      <section key={pane} className="master-prompt-dialog__pane">
        <header className="master-prompt-dialog__pane-header">
          <h3>{pane === 'left' ? 'Left Pane' : 'Right Pane'}</h3>
        </header>

        <div className="master-prompt-dialog__prompt-row master-prompt-dialog__prompt-row--pane">
          <div className="master-prompt-dialog__prompt-container">
            <h4 className="master-prompt-dialog__prompt-label">Master Prompt</h4>
            <textarea
              className="master-prompt-dialog__prompt-input"
              value={comparativePrompts[pane] || ''}
              onChange={(event) => setComparativePrompts((prev) => ({ ...prev, [pane]: event.target.value }))}
              placeholder="Enter master prompt"
              rows={7}
              disabled={isPaneLoading}
            />
          </div>
          {renderReferenceImages(paneData?.reference_images || paneData?.referenceImages || [])}
        </div>

        <button
          type="button"
          className="master-prompt-dialog__btn master-prompt-dialog__btn--regenerate"
          onClick={() => onRegenerate?.(pane, comparativePrompts[pane])}
          disabled={disableRegenerate}
        >
          <MdRefresh size={16} />
          Regenerate
        </button>

        <div className="master-prompt-dialog__image-wrapper">
          <h4 className="master-prompt-dialog__prompt-label">Master Image</h4>
          <div className={`master-prompt-dialog__image-container ${isPaneLoading ? 'master-prompt-dialog__image-container--loading' : ''}`}>
            {paneData?.image ? (
              <img src={paneData.image} alt={`${pane} master`} className="master-prompt-dialog__image" />
            ) : (
              <div className="master-prompt-dialog__image-placeholder">No image generated yet</div>
            )}
            {isPaneLoading && (
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
            value={comparativeEdits[pane] || ''}
            onChange={(event) => setComparativeEdits((prev) => ({ ...prev, [pane]: event.target.value }))}
            placeholder="e.g. make the silhouette softer"
            disabled={isPaneLoading}
          />
          <button
            type="button"
            className="master-prompt-dialog__btn master-prompt-dialog__btn--edit"
            onClick={() => onSendEdit?.(pane, comparativeEdits[pane])}
            disabled={disableSendEdit}
          >
            <MdSend size={16} />
            Send Edit
          </button>
        </div>
      </section>
    )
  }

  if (!isOpen || !data) {
    return null
  }

  const comparativeCanConfirm = COMPARATIVE_PANES.every((pane) => Boolean(data?.panes?.[pane]?.image))

  return (
    <div className="master-prompt-dialog" role="dialog" aria-modal="true">
      <div
        className="master-prompt-dialog__backdrop"
        onClick={() => {
          if (!isLoading) handleClose()
        }}
      />
      <div className={`master-prompt-dialog__content${isComparative ? ' master-prompt-dialog__content--comparative' : ''}`} onClick={stopEvent}>
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
          <h2>{isComparative ? 'Comparative Input Confirmation' : 'Input Confirmation'}</h2>
          <p>
            {isComparative
              ? 'Review both master prompts and images before the shared TRELLIS queue starts.'
              : 'Review the generated master image.'}
          </p>
        </header>

        {isComparative ? (
          <>
            <div className="master-prompt-dialog__comparative-grid">
              {COMPARATIVE_PANES.map(renderComparativePane)}
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
                onClick={() => onConfirm?.()}
                disabled={isLoading || !comparativeCanConfirm}
              >
                <MdCheck size={16} />
                Confirm Both
              </button>
            </div>
          </>
        ) : renderSinglePane()}
      </div>
    </div>
  )
}

export default MasterPromptDialog
