import React, { useCallback, useEffect, useState, useRef, Suspense } from 'react'
import { MdImage, MdViewInAr, MdClose, MdAdsClick } from 'react-icons/md'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF, Center, Bounds, Environment } from '@react-three/drei'
import { useMoodboardStore } from '../../store/moodboardStore'
import './GenerateDialog.css' // Reuse the same CSS

function Model3D({ url }) {
  const { scene } = useGLTF(url)
  return <primitive object={scene} />
}

function AdaptDialog({ isOpen, onClose, onAdapt, isGenerating }) {
  const [subjectText, setSubjectText] = useState('')
  const [styleIntent, setStyleIntent] = useState('')
  const [subjectFile, setSubjectFile] = useState(null) // { type: 'image'|'model', data: base64, name: string }
  
  const isPickingElement = useMoodboardStore((s) => s.isPickingElement)
  const setIsPickingElement = useMoodboardStore((s) => s.setIsPickingElement)
  const pickedElement = useMoodboardStore((s) => s.pickedElement)
  const setPickedElement = useMoodboardStore((s) => s.setPickedElement)

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
      if (isPickingElement) {
        setIsPickingElement(false)
      }
      return
    }

    const handleKeyDown = (event) => {
      // If picking an element from the moodboard, let Canvas handle Escape to cancel picking
      if (isPickingElement) return
      
      if (event.key === 'Escape' && !isGenerating) {
        event.preventDefault()
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleClose, isGenerating, isPickingElement, setIsPickingElement])

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

  useEffect(() => {
    if (pickedElement) {
      setSubjectFile(pickedElement)
      setPickedElement(null)
      // also clear text when a file is picked
      setSubjectText('')
    }
  }, [pickedElement, setPickedElement])

  if (!isOpen || isPickingElement) {
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
          <p>Provide a subject and describe which part of the moodboard it should adapt to.</p>
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
                  placeholder="e.g., A basic wooden chair..."
                  rows={2}
                  disabled={isGenerating}
                />
                <div style={{ display: 'flex', alignItems: 'center', margin: '0.5rem 0' }}>
                  <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--color-border)' }}></div>
                  <div style={{ margin: '0 1rem', fontWeight: 'bold', color: '#888', fontSize: '0.9rem' }}>OR</div>
                  <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--color-border)' }}></div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="btn btn-secondary" style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.5rem' }}>
                      <MdImage className="btn-icon" size={18} /> <span style={{ whiteSpace: 'nowrap' }}>Upload Image</span>
                  </button>
                    <button type="button" onClick={() => modelInputRef.current?.click()} className="btn btn-secondary" style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.5rem' }}>
                      <MdViewInAr className="btn-icon" size={18} /> <span style={{ whiteSpace: 'nowrap' }}>Upload 3D</span>
                  </button>
                    <button type="button" onClick={() => setIsPickingElement(true)} className="btn btn-secondary" style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.5rem' }}>
                      <MdAdsClick className="btn-icon" size={18} /> <span style={{ whiteSpace: 'nowrap' }}>Pick from Moodboard</span>
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ position: 'relative', width: '100%', height: '240px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '4px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <button type="button" onClick={clearSubjectFile} disabled={isGenerating} title="Remove subject" style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', zIndex: 10, background: 'var(--color-button-bg)', border: '1px solid var(--color-border)', cursor: 'pointer', color: 'var(--color-text-primary)', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', padding: 0 }}>
                  <MdClose size={16} />
                </button>
                {subjectFile.type === 'image' ? (
                  <img src={subjectFile.data} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} alt="Subject" />
                ) : (
                  <div style={{ width: '100%', height: '100%' }}>
                    <Suspense fallback={<div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>Loading model...</div>}>
                      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
                        <ambientLight intensity={1.5} />
                        <directionalLight position={[10, 10, 10]} intensity={2.5} />
                        <directionalLight position={[-10, -10, -10]} intensity={1} />
                        <Bounds fit clip observe margin={1.2}>
                          <Center>
                            <Model3D url={subjectFile.data} />
                          </Center>
                        </Bounds>
                        <Environment preset="city" />
                        <OrbitControls makeDefault enableZoom={true} />
                      </Canvas>
                    </Suspense>
                  </div>
                )}
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