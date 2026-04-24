import React, { useCallback, useEffect, useState } from 'react'
import { MdSave, MdStorage } from 'react-icons/md'
import './SaveDialog.css'

function SaveDialog({ isOpen, onClose, onSaveToSystem, onSaveToDataset }) {
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [baselinePrompt, setBaselinePrompt] = useState('')
  const [status, setStatus] = useState(null)  // { type: 'success'|'error', message: string }
  const [saving, setSaving] = useState(false)

  const handleClose = useCallback(() => {
    if (!saving) onClose?.()
  }, [onClose, saving])

  useEffect(() => {
    if (!isOpen) {
      setName('')
      setPrompt('')
      setBaselinePrompt('')
      setStatus(null)
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

  const slugifiedName = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const canSaveToDataset = slugifiedName.length > 0

  const handleSaveToDataset = async () => {
    if (!canSaveToDataset || saving) return
    setSaving(true)
    setStatus(null)
    try {
      await onSaveToDataset({ name: slugifiedName, prompt: prompt.trim(), baselinePrompt: baselinePrompt.trim() })
      setStatus({ type: 'success', message: `Saved to pipeline/datasets/${slugifiedName}/` })
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Failed to save to dataset.' })
    } finally {
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
          <p>Save to your local machine or add it as an evaluation dataset for the A/B pipeline.</p>
        </header>

        {/* Dataset fields */}
        <div className="save-dialog__field">
          <label className="save-dialog__label" htmlFor="sd-name">
            Dataset name
            <span>(for pipeline use)</span>
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
            <p className="save-dialog__hint">Will be saved as: <strong>{slugifiedName}</strong></p>
          )}
        </div>

        <div className="save-dialog__field">
          <label className="save-dialog__label" htmlFor="sd-prompt">
            Imagin3D prompt
            <span>(optional — can be added later)</span>
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

        <div className="save-dialog__field">
          <label className="save-dialog__label" htmlFor="sd-baseline">
            Baseline prompt
            <span>(what a human would type without the moodboard)</span>
          </label>
          <textarea
            id="sd-baseline"
            className="save-dialog__textarea"
            value={baselinePrompt}
            onChange={e => setBaselinePrompt(e.target.value)}
            placeholder="e.g. A futuristic lounge chair with organic flowing curves, metallic finish, isolated on a white background, studio lighting, detailed 3D render."
            disabled={saving}
            rows={3}
          />
        </div>

        {status && (
          <div className={`save-dialog__status save-dialog__status--${status.type}`}>
            {status.message}
          </div>
        )}

        <div className="save-dialog__actions">
          <button
            className="save-dialog__btn save-dialog__btn--dataset"
            onClick={handleSaveToDataset}
            disabled={!canSaveToDataset || saving}
          >
            <MdStorage size={17} />
            {saving ? 'Saving…' : 'Save to dataset'}
          </button>

          <div className="save-dialog__divider">or</div>

          <button
            className="save-dialog__btn save-dialog__btn--system"
            onClick={handleSaveToSystem}
            disabled={saving}
          >
            <MdSave size={17} />
            Save to system
          </button>
        </div>
      </div>
    </div>
  )
}

export default SaveDialog
