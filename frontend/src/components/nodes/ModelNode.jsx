import React, { useRef, useState, Suspense, useEffect, memo } from 'react'
import { useMoodboardStore } from '../../store/moodboardStore'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF, Environment } from '@react-three/drei'
import { NodeResizer } from 'reactflow'
import NodeLayerControls from './NodeLayerControls'
import WeightOverlay from './WeightOverlay'
import * as THREE from 'three'
import './ModelNode.css'

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
    if (this.state.hasError) return null
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

function ModelNode({ id, data, selected }) {
  const [error, setError] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  const canvasRef = useRef(null)
  const isGenerating = useMoodboardStore((s) => s.isGenerating)

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

  // Model name for title bar
  const modelName = data?.fileName || '3D Model'

  return (
    <>
      <NodeResizer
        isVisible={selected && !isGenerating}
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
        <NodeLayerControls id={id} isVisible={selected && !isGenerating} />
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
            <div className="model-canvas-wrapper">
              <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
                <ambientLight intensity={1.5} />
                <directionalLight position={[10, 10, 10]} intensity={2.5} />
                <directionalLight position={[-10, -10, -10]} intensity={1} />
                <Suspense fallback={null}>
                  <ModelErrorBoundary onError={setError}>
                    <Model3D url={data.src} />
                  </ModelErrorBoundary>
                </Suspense>
                <Environment preset="city" />
                <OrbitControls 
                  makeDefault 
                  enableZoom={false} 
                  enablePan={false}
                  enableRotate={true}
                />
              </Canvas>
              {selected && (
                <div className="model-controls-hint">
                  Drag to rotate
                </div>
              )}
            </div>
          )}
          <WeightOverlay nodeId={id} weight={data.weight} />
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
