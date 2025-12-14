import { useCallback, useEffect, useState, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, } from '@react-three/drei'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import './ModelDialog.css'

function Model3D({ url, onError }) {
  const [model, setModel] = useState(null)
  
  useEffect(() => {
    let isMounted = true
    
    const loadModel = async () => {
      try {
        const gltf = await new Promise((resolve, reject) => {
          const loader = new GLTFLoader()
          loader.load(
            url,
            (gltf) => resolve(gltf),
            undefined,
            (error) => reject(error)
          )
        })
        
        if (!isMounted) return
        
        // Process the scene
        gltf.scene.traverse((child) => {
          if (!child.isMesh) return
          child.castShadow = false
          child.receiveShadow = false
        })
                
        // Calculate bounding box
        const box = new THREE.Box3().setFromObject(gltf.scene)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())

        // Calculate scale
        const maxDim = Math.max(size.x, size.y, size.z)
        const scale = 2.5 / maxDim 
        gltf.scene.scale.setScalar(scale)

        // Position
        const yOffset = size.y * scale * 0.1
        gltf.scene.position.set(
          -center.x * scale,
          -center.y * scale + yOffset,
          -center.z * scale
        )
        
        setModel(gltf.scene)
      } catch (error) {
        console.error('Error loading 3D model:', error)
        if (isMounted && onError) {
          onError()
        }
      }
    }
    
    loadModel()
    
    return () => {
      isMounted = false
      if (model) {
        model.traverse((child) => {
          if (child.geometry) child.geometry.dispose()
          if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose())
            } else {
                child.material.dispose()
            }
          }
        })
      }
    }
  }, [url, onError])

  if (!model) return null
  return <primitive object={model} />
}

function ModelDialog({ 
  isOpen, 
  onClose, 
  modelUrl,
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
                {/* Top & Bottom */}
                <directionalLight position={[0, 10, 0]} intensity={5} />
                <directionalLight position={[0, -10, 0]} intensity={5} />
                {/* Front, Back, Left, Right */}
                <directionalLight position={[10, 0, 0]} intensity={5} />
                <directionalLight position={[-10, 0, 0]} intensity={5} />
                <directionalLight position={[0, 0, 10]} intensity={5} />
                <directionalLight position={[0, 0, -10]} intensity={5} />
                {/* 4 Diagonals */}
                <directionalLight position={[7, 0, 7]} intensity={5} />
                <directionalLight position={[-7, 0, 7]} intensity={5} />
                <directionalLight position={[7, 0, -7]} intensity={5} />
                <directionalLight position={[-7, 0, -7]} intensity={5} />
                <Suspense fallback={null}>
                    {modelUrl && <Model3D url={modelUrl} />}
                </Suspense>
                <OrbitControls makeDefault />
             </Canvas>
          </div>
        </div>

        <div className="model-dialog__actions">
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
  )
}

export default ModelDialog