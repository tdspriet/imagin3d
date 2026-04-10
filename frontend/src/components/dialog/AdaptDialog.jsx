import React, { useCallback, useEffect, useState, useRef } from 'react'
import { MdImage, MdViewInAr, MdClose } from 'react-icons/md'
import './GenerateDialog.css' // Reuse the same CSS

function AdaptDialog({ isOpen, onClose, onAdapt, isGenerating }) {
  const [subjectText, setSubjectText] = useState('')
  const [styleIntent, setStyleIntent] = useState('')
  const [subjectFile, setSubjectFile] = useState(null) // { type: 'image'|'model', data: base64, name: string }
  
  const fileInputRef = useRef(null)
  const modelInputRef = useRef(null)

  const handleClose = useCallback(() => {
    if (!isGenerating) {
      onClose?.()
    }
  }, [onClose, isGenerating])

  useEffect(() => {
    if (!isOpen) {
      setSubjectText('')
      setStyleIntent('')
      setSubjectFile(null)
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
    if ((subjectText.trim() || subjectFile) && styleIntent.trim() && !isGenerating) {
      onAdapt({
        subjectText: subjectText.trim(),
        subjectFile: subjectFile,
        styleIntent: styleIntent.trim()
      })
    }
  }

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setSubjectFile({ type: 'image', data: event.target.result, name: file.name })
        setSubjectText('') // Clear text if file is uploaded
      }
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }

  const handleModelUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      const validExtensions = ['.glb', '.gltf']
      const fileExtension = '.' + file.name.split('.').pop().toLowerCase()
      if (validExtensions.includes(fileExtension)) {
        const reader = new FileReader()
        reader.onload = (event) => {
          setSubjectFile({ type: 'model', data: event.target.result, name: file.name })
          setSubjectText('') // Clear text if file is uploaded
        }
        reader.readAsDataURL(file)
      } else {
        alert('Please upload a valid 3D model file (.glb, .gltf)')
      }
    }
    e.target.value = ''
  }

  const clearSubjectFile = () => setSubjectFile(null)

  if (!isOpen) {
    return null
  }

  return (
    <div className="generate-dialog" role="dialog" aria-modal="true">
      <div
        className="generate-dialog__backdrop"
        onClick={handleClose}
      />
      <div className="generate-dialog__content" onClick={(event) => event.stopPropagation()} style={{ maxWidth: '600px' }}>
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
          <h2>Adapt to Moodboard</h2>
          <p>Provide a subject (text or file) and describe which part of the moodboard it should adapt to.</p>
        </header>

        <form onSubmit={handleSubmit} className="generate-dialog__form">
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>1. What is the subject?</label>
            {!subjectFile ? (
              <div>
                <textarea
                  className="generate-dialog__input"
                  value={subjectText}
                  onChange={(e) => setSubjectText(e.target.value)}
                  placeholder="e.g., A basic wooden chair, OR upload a reference file..."
                  rows={2}
                  disabled={isGenerating}
                />
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="btn btn-secondary" style={{ flex: 1 }}>
                    <MdImage className="btn-icon" size={18} /> Upload Image
                  </button>
                  <button type="button" onClick={() => modelInputRef.current?.click()} className="btn btn-secondary" style={{ flex: 1 }}>
                    <MdViewInAr className="btn-icon" size={18} /> Upload 3D Model
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {subjectFile.type === 'image' ? <MdImage size={24}/> : <MdViewInAr size={24}/>}
                  <span style={{ wordBreak: 'break-all' }}>{subjectFile.name} attached</span>
                </div>
                <button type="button" onClick={clearSubjectFile} disabled={isGenerating} className="btn-icon" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)' }}>
                  <MdClose size={20} />
                </button>
              </div>
            )}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>2. Which part of the moodboard should it adapt to?</label>
            <textarea
              className="generate-dialog__input"
              value={styleIntent}
              onChange={(e) => setStyleIntent(e.target.value)}
              placeholder="e.g., Adapt it to the magical forest part of my moodboard..."
              rows={3}
              disabled={isGenerating}
            />
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
              disabled={!(subjectText.trim() || subjectFile) || !styleIntent.trim() || isGenerating}
            >
              {isGenerating ? 'Adapting...' : 'Adapt'}
            </button>
          </div>
        </form>

        {/* Hidden inputs */}
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
        <input ref={modelInputRef} type="file" accept=".glb,.gltf" onChange={handleModelUpload} style={{ display: 'none' }} />

      </div>
    </div>
  )
}

export default AdaptDialog