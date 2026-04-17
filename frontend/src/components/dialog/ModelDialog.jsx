import React, { useCallback, useEffect, Suspense, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF, Environment, Html } from '@react-three/drei'
import { useMoodboardStore } from '../../store/moodboardStore'
import * as THREE from 'three'
import './ModelDialog.css'

class ModelErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true }
  }
  componentDidCatch(error) {
    if (this.props.onError) this.props.onError(true)
  }
  render() {
    if (this.state.hasError) {
      return <Html center><div style={{ color: 'var(--color-error)' }}>Failed to load model</div></Html>
    }
    return this.props.children
  }
}

function Model3D({ url }) {
  const { scene } = useGLTF(url)
  const clonedScene = React.useMemo(() => scene ? scene.clone() : null, [scene])
  
  React.useEffect(() => {
    if (!clonedScene) return
    
    // Reset to compute actual size
    clonedScene.scale.setScalar(1)
    clonedScene.position.set(0, 0, 0)
    clonedScene.updateMatrixWorld(true)
    
    const box = new THREE.Box3().setFromObject(clonedScene)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const scale = 2.5 / maxDim
    clonedScene.scale.setScalar(scale)
    
    // Push the object up 0.25 unit after centering
    clonedScene.position.set(
      -center.x * scale,
      -center.y * scale + 0.25,
      -center.z * scale
    )
  }, [clonedScene])

  return clonedScene ? <primitive object={clonedScene} /> : null
}

function ModelDialog({ 
  isOpen, 
  onClose, 
  modelUrl,
}) {
  const handleClose = useCallback(() => {
    onClose?.()
  }, [onClose])

  const preservationScore = useMoodboardStore((state) => state.preservationScore)
  const closenessScore = useMoodboardStore((state) => state.closenessScore)

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

  const handleDownload = () => {
    if (!modelUrl) return
    const link = document.createElement('a')
    link.href = modelUrl
    link.download = 'model.glb'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="model-dialog" role="dialog" aria-modal="true">
      <div
        className="model-dialog__backdrop"
        onClick={handleClose}
      />
      <div className="model-dialog__content" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="model-dialog__close"
          onClick={handleClose}
          aria-label="Close"
        >
          ×
        </button>

        <header className="model-dialog__header">
          <h2>Generated 3D Model</h2>
          <p>Review and download your generated 3D model.</p>
        </header>

        <div className="model-dialog__body">
          <div className="model-dialog__canvas-container">
             <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
               <ambientLight intensity={1.5} />
               <directionalLight position={[10, 10, 10]} intensity={2.5} />
               <directionalLight position={[-10, -10, -10]} intensity={1} />
               <Suspense fallback={null}>
                 {modelUrl && (
                   <ModelErrorBoundary>
                     <Model3D url={modelUrl} />
                   </ModelErrorBoundary>
                 )}
               </Suspense>
               <Environment preset="city" />
               <OrbitControls makeDefault enableZoom={true} />
             </Canvas>
          </div>
        </div>

        <div className="model-dialog__actions">
          <div className="model-dialog__scores">
            <div className="model-dialog__score-item">
              <span className="model-dialog__score-label" title="How well the 3D model preserves the 2D master image generation">2D to 3D Preservation</span>
              <span className={`model-dialog__score-value ${preservationScore === null ? 'loading' : ''}`}>
                {preservationScore !== null ? `${preservationScore}%` : 'Calculating...'}
              </span>
            </div>
            <div className="model-dialog__score-item">
              <span className="model-dialog__score-label" title="How close the generated model is to the original moodboard intention">Moodboard Closeness</span>
              <span className={`model-dialog__score-value ${closenessScore === null ? 'loading' : ''}`}>
                {closenessScore !== null ? `${closenessScore}%` : (preservationScore !== null ? 'Calculating...' : 'Calculating...')}
              </span>
            </div>
          </div>
          <div className="model-dialog__buttons">
            <button
              type="button"
              className="model-dialog__btn model-dialog__btn--secondary"
              onClick={handleClose}
            >
              Close
            </button>
            <button
              type="button"
              className="model-dialog__btn model-dialog__btn--primary"
              onClick={handleDownload}
            >
              Download
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ModelDialog