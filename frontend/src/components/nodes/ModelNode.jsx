import { useRef, useState, Suspense, useEffect, memo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { NodeResizer } from 'reactflow'
import NodeLayerControls from './NodeLayerControls'
import WeightOverlay from './WeightOverlay'
import './ModelNode.css'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'

// Register the extension to suppress warnings
if (typeof GLTFLoader !== 'undefined') {
  GLTFLoader.prototype.register = function(callback) {
    if (this.pluginCallbacks === undefined) {
      this.pluginCallbacks = []
    }
    this.pluginCallbacks.push(callback)
    return this
  }
}

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
          if (child.isMesh) {
            // Convert unsupported materials to standard materials
            if (child.material) {
              // If material has issues, create a new standard material
              if (!child.material.isMeshStandardMaterial && !child.material.isMeshBasicMaterial) {
                const newMaterial = new THREE.MeshStandardMaterial({
                  color: child.material.color || 0xffffff,
                  map: child.material.map || null,
                  roughness: 0.5,
                  metalness: 0.1,
                })
                child.material = newMaterial
              }
              child.material.needsUpdate = true
            }
            child.castShadow = false
            child.receiveShadow = false
          }
        })
        
        // Calculate bounding box before any transformations
        const box = new THREE.Box3().setFromObject(gltf.scene)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())

        // Calculate scale based on the largest dimension and apply it
        const maxDim = Math.max(size.x, size.y, size.z)
        const scale = 2.5 / maxDim // Normalize to fit in a 2.5 unit cube
        gltf.scene.scale.setScalar(scale)

        // After scaling, position the model so its scaled center is at the origin. (a bit higher on Y axis)
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
      // Cleanup
      if (model) {
        model.traverse((child) => {
          if (child.geometry) child.geometry.dispose()
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(material => material.dispose())
            } else {
              child.material.dispose()
            }
          }
        })
      }
    }
  }, [url, onError])
  
  return model ? <primitive object={model} /> : null
}

function ModelNode({ id, data, selected }) {
  const [error, setError] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  const canvasRef = useRef(null)
  const glRef = useRef(null)
  const themeListenerRef = useRef(null)

  // Handle WebGL context loss
  useEffect(() => {
    const handleContextLost = (event) => {
      event.preventDefault()
      console.warn('WebGL context lost for model node:', id)
      setContextLost(true)
    }
    const handleContextRestored = () => {
      setContextLost(false)
    }
    const canvas = canvasRef.current?.querySelector('canvas')
    if (canvas) {
      canvas.addEventListener('webglcontextlost', handleContextLost)
      canvas.addEventListener('webglcontextrestored', handleContextRestored)
      return () => {
        canvas.removeEventListener('webglcontextlost', handleContextLost)
        canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      }
    }
  }, [id])

  // Update renderer clearColor when system theme changes
  useEffect(() => {
    const updateBg = () => {
      if (!glRef.current) return
      try {
        const cssBg = getComputedStyle(document.documentElement).getPropertyValue('--color-surface-alt') || '#1a1a1a'
        const color = cssBg.trim() || '#1a1a1a'
        glRef.current.setClearColor(new THREE.Color(color))
      } catch (err) {
        // ignore
      }
    }

    // Listen to prefers-color-scheme changes
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    if (mql && typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', updateBg)
      themeListenerRef.current = () => mql.removeEventListener('change', updateBg)
    } else if (mql && typeof mql.addListener === 'function') {
      mql.addListener(updateBg)
      themeListenerRef.current = () => mql.removeListener(updateBg)
    }

    // also expose manual update if needed
    updateBg()

    return () => {
      if (themeListenerRef.current) themeListenerRef.current()
    }
  }, [])

  // Model name for title bar
  const modelName = data?.fileName || '3D Model'


  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={150}
        minHeight={150}
        keepAspectRatio={true}
        handles={["nw", "ne", "sw", "se"]}
        lineClassName="node-resizer-line"
        handleClassName="node-resizer-handle"
      />
      <div className="node-frame">
        <div className="model-titlebar react-flow-drag-handle" title="Drag to move node">
          <span className="model-title">{modelName}</span>
        </div>
        <NodeLayerControls id={id} isVisible={selected} />
        <div className="model-node" ref={canvasRef}>
          {error ? (
            <div className="model-error">
              <span>⚠️</span>
              <p>Failed to load 3D model</p>
              <small>Supported formats: GLB, GLTF</small>
            </div>
          ) : contextLost ? (
            <div className="model-error">
              <span>🔄</span>
              <p>WebGL context lost</p>
              <small>Try resizing or reloading the page</small>
            </div>
          ) : (
            <div 
              className="model-canvas-wrapper"
            >
              <Canvas
                style={{ width: '100%', height: '100%' }}
                camera={{ position: [0, 0, 5], fov: 45 }}
                dpr={[1, 1.5]}
                gl={{ 
                  antialias: true,
                  alpha: false,
                  powerPreference: 'high-performance',
                  preserveDrawingBuffer: false,
                  failIfMajorPerformanceCaveat: false,
                  stencil: false,
                  depth: true
                }}
                onCreated={({ gl }) => {
                  glRef.current = gl
                  // Set renderer clear color from CSS variable so background follows theme
                  try {
                    const cssBg = getComputedStyle(document.documentElement).getPropertyValue('--color-surface-alt') || '#1a1a1a'
                    const color = cssBg.trim() || '#1a1a1a'
                    gl.setClearColor(new THREE.Color(color))
                  } catch (err) {
                    gl.setClearColor(new THREE.Color('#1a1a1a'))
                  }
                  gl.toneMapping = THREE.ACESFilmicToneMapping
                  gl.toneMappingExposure = 1.2
                  gl.outputEncoding = THREE.sRGBEncoding
                }}
              >
                <Suspense fallback={null}>
                  <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={45} />
                  <ambientLight intensity={0.6} />
                  <directionalLight position={[5, 5, 5]} intensity={0.8} castShadow={false} />
                  <directionalLight position={[-5, -5, 5]} intensity={0.4} castShadow={false} />
                  <Model3D url={data.src} onError={() => setError(true)} />
                  <OrbitControls
                    makeDefault
                    enablePan={false}
                    enableZoom={false}
                    enableRotate={true}
                    autoRotate={false}
                    rotateSpeed={0.5}
                    enableDamping={true}
                    dampingFactor={0.05}
                  />
                </Suspense>
              </Canvas>
              {selected && (
                <div className="model-controls-hint">
                  Drag to rotate
                </div>
              )}
            </div>
          )}
          <WeightOverlay weight={data.weight} reasoning={data.reasoning} />
        </div>
      </div>
    </>
  )
}

const areEqual = (prevProps, nextProps) =>
  prevProps.id === nextProps.id &&
  prevProps.selected === nextProps.selected &&
  prevProps.data === nextProps.data

export default memo(ModelNode, areEqual)
