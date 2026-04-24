import React, { useCallback, useEffect, useState } from 'react'
import { MdSave, MdStorage } from 'react-icons/md'
import './SaveDialog.css'

function SaveDialog({ isOpen, onClose, onSaveToSystem, onSaveToDataset }) {
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [isMultiview, setIsMultiview] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleClose = useCallback(() => {
    if (!saving) onClose?.()
  }, [onClose, saving])

  useEffect(() => {
    if (!isOpen) {
      setName('')
      setPrompt('')
      setIsMultiview(false)
      setSaving(false)
      return
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !saving) {
        e.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, saving, handleClose])

  if (!isOpen) return null

  const slugifiedName = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  const canSaveToDataset = slugifiedName.length > 0

  const handleSaveToDataset = async () => {
    if (!canSaveToDataset || saving) return
    setSaving(true)
    try {
      await onSaveToDataset({ name: slugifiedName, prompt: prompt.trim(), isMultiview })
      onClose?.()
    } catch (err) {
      setSaving(false)
    }
  }

  const handleSaveToSystem = () => {
    onSaveToSystem?.()
    onClose?.()
  }

  return (
    <div className="save-dialog" role="dialog" aria-modal="true">
      <div className="save-dialog__backdrop" onClick={handleClose} />
      <div className="save-dialog__content" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          className="save-dialog__close"
          onClick={handleClose}
          aria-label="Close"
          disabled={saving}
        >
          ×
        </button>

        <header className="save-dialog__header">
          <h2>Save Moodboard</h2>
        </header>

        <button
          className="save-dialog__btn save-dialog__btn--system"
          onClick={handleSaveToSystem}
          disabled={saving}
        >
          <MdSave size={17} />
          Save to system
        </button>

        <div className="save-dialog__divider">OR</div>

        <header className="save-dialog__header">
          <p>Save to the Coder instance for A/B pipeline testing.</p>
        </header>

        <div className="save-dialog__field">
          <label className="save-dialog__label" htmlFor="sd-name">
            Dataset name
          </label>
          <input
            id="sd-name"
            className="save-dialog__input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. futuristic_chair"
            disabled={saving}
            autoFocus
          />
          {slugifiedName && name.trim() !== slugifiedName && (
            <p className="save-dialog__hint">
              Will be saved as: <strong>{slugifiedName}</strong>
            </p>
          )}
        </div>

        <div className="save-dialog__field">
          <label className="save-dialog__label" htmlFor="sd-prompt">
            Prompt
          </label>
          <input
            id="sd-prompt"
            className="save-dialog__input"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="e.g. A futuristic lounge chair with organic curves"
            disabled={saving}
          />
        </div>

        <div className="save-dialog__option">
          <label className="save-dialog__toggle">
            <input
              type="checkbox"
              className="save-dialog__toggle-input"
              checked={isMultiview}
              onChange={e => setIsMultiview(e.target.checked)}
              disabled={saving}
            />
            <div className="save-dialog__toggle-track">
              <div className="save-dialog__toggle-thumb"></div>
            </div>
            <span className="save-dialog__toggle-label">Generate multiple views</span>
          </label>
        </div>

        <div className="save-dialog__actions">
          <button
            className="save-dialog__btn save-dialog__btn--dataset"
            onClick={handleSaveToDataset}
            disabled={!canSaveToDataset || saving}
          >
            <MdStorage size={17} />
            {saving ? 'Saving…' : 'Save to dataset'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SaveDialog
