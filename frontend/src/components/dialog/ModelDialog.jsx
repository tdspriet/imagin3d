import { useCallback, useEffect, useState, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { useMoodboardStore } from '../../store/moodboardStore'
import './ModelDialog.css'

function Model3D({ url, onError }) {
  const [model, setModel] = useState(null)

  useEffect(() => {
    let isMounted = true

    const loadModel = async () => {
      try {
        const gltf = await new Promise((resolve, reject) => {
          const loader = new GLTFLoader()
          loader.load(url, resolve, undefined, reject)
        })

        if (!isMounted) return

        gltf.scene.traverse((child) => {
          if (!child.isMesh) return
          child.castShadow = false
          child.receiveShadow = false
        })

        const box = new THREE.Box3().setFromObject(gltf.scene)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z) || 1
        const scale = 2.5 / maxDim

        gltf.scene.scale.setScalar(scale)

        const yOffset = size.y * scale * 0.1
        gltf.scene.position.set(
          -center.x * scale,
          -center.y * scale + yOffset,
          -center.z * scale
        )

        setModel(gltf.scene)
      } catch (error) {
        console.error('Error loading 3D model:', error)
        if (isMounted) {
          onError?.()
        }
      }
    }

    loadModel()

    return () => {
      isMounted = false
      if (!model) return
      model.traverse((child) => {
        if (child.geometry) child.geometry.dispose()
        if (!child.material) return
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material.dispose())
        } else {
          child.material.dispose()
        }
      })
    }
  }, [model, onError, url])

  if (!model) return null
  return <primitive object={model} />
}

function ModelViewport({ url }) {
  return (
    <div className="model-dialog__canvas-container">
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
        <directionalLight position={[0, 10, 0]} intensity={5} />
        <directionalLight position={[0, -10, 0]} intensity={5} />
        <directionalLight position={[10, 0, 0]} intensity={5} />
        <directionalLight position={[-10, 0, 0]} intensity={5} />
        <directionalLight position={[0, 0, 10]} intensity={5} />
        <directionalLight position={[0, 0, -10]} intensity={5} />
        <directionalLight position={[7, 0, 7]} intensity={5} />
        <directionalLight position={[-7, 0, 7]} intensity={5} />
        <directionalLight position={[7, 0, -7]} intensity={5} />
        <directionalLight position={[-7, 0, -7]} intensity={5} />
        <Suspense fallback={null}>
          {url ? <Model3D url={url} /> : null}
        </Suspense>
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  )
}

function downloadModel(modelUrl, fileName) {
  if (!modelUrl) return
  const link = document.createElement('a')
  link.href = modelUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function ComparativePane({ title, modelUrl, score, fileName }) {
  return (
    <section className="model-dialog__pane">
      <header className="model-dialog__pane-header">
        <h3>{title}</h3>
        <span className="model-dialog__score">
          {typeof score === 'number' ? `Score: ${score}%` : 'Score unavailable'}
        </span>
      </header>
      <ModelViewport url={modelUrl} />
      <div className="model-dialog__pane-actions">
        <button
          type="button"
          className="model-dialog__btn model-dialog__btn--primary"
          onClick={() => downloadModel(modelUrl, fileName)}
        >
          Download
        </button>
      </div>
    </section>
  )
}

function ModelDialog({
  isOpen,
  onClose,
  mode = 'single',
  modelUrl,
  models,
}) {
  const handleClose = useCallback(() => {
    onClose?.()
  }, [onClose])

  const score = useMoodboardStore((state) => state.score)

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
  }, [handleClose, isOpen])

  if (!isOpen) {
    return null
  }

  const isComparative = mode === 'comparative'

  return (
    <div className="model-dialog" role="dialog" aria-modal="true">
      <div className="model-dialog__backdrop" onClick={handleClose} />
      <div
        className={`model-dialog__content${isComparative ? ' model-dialog__content--comparative' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="model-dialog__close"
          onClick={handleClose}
          aria-label="Close"
        >
          ×
        </button>

        <header className="model-dialog__header">
          <h2>{isComparative ? 'Generated 3D Models' : 'Generated 3D Model'}</h2>
          <p>
            {isComparative
              ? 'Review both generated 3D models side by side.'
              : 'Review and download your generated 3D model.'}
          </p>
        </header>

        {isComparative ? (
          <>
            <div className="model-dialog__comparative-grid">
              <ComparativePane
                title="Left Pane"
                modelUrl={models?.left?.modelUrl}
                score={models?.left?.score}
                fileName="left-model.glb"
              />
              <ComparativePane
                title="Right Pane"
                modelUrl={models?.right?.modelUrl}
                score={models?.right?.score}
                fileName="right-model.glb"
              />
            </div>
            <div className="model-dialog__actions model-dialog__actions--comparative">
              <button
                type="button"
                className="model-dialog__btn model-dialog__btn--secondary"
                onClick={handleClose}
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="model-dialog__body">
              <ModelViewport url={modelUrl} />
            </div>

            <div className="model-dialog__actions">
              <div className="model-dialog__score">
                {score !== null ? `Score: ${score}%` : 'Calculating score...'}
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
                  onClick={() => downloadModel(modelUrl, 'model.glb')}
                >
                  Download
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ModelDialog
