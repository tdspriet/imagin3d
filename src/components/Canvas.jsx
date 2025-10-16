import React, { useCallback, useEffect, useRef } from 'react'
import ReactFlow, {
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  applyNodeChanges,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useMoodboardStore } from '../store/moodboardStore'
import ImageNode from './nodes/ImageNode'
import VideoNode from './nodes/VideoNode'
import TextNode from './nodes/TextNode'
import FontNode from './nodes/FontNode'
import './Canvas.css'

// Register custom node types
const nodeTypes = {
  imageNode: ImageNode,
  videoNode: VideoNode,
  textNode: TextNode,
  fontNode: FontNode,
}

/**
 * Canvas Component
 * Main ReactFlow canvas for the moodboard
 */
function Canvas() {
  const { nodes, setNodes, onNodesChange, edges, fitViewTrigger, setReactFlowInstance } = useMoodboardStore()
  const reactFlowWrapper = useRef(null)
  const [localNodes, setLocalNodes] = useNodesState(nodes)
  const [localEdges, setLocalEdges] = useEdgesState(edges)
  const reactFlowInstanceRef = useRef(null)

  // Sync store nodes with local nodes
  useEffect(() => {
    setLocalNodes(nodes)
  }, [nodes, setLocalNodes])

  // Handle node changes (position, selection, etc.)
  const handleNodesChange = useCallback(
    (changes) => {
      const updatedNodes = applyNodeChanges(changes, localNodes)
      setLocalNodes(updatedNodes)
      setNodes(updatedNodes)
    },
    [localNodes, setLocalNodes, setNodes]
  )

  // Handle ReactFlow initialization
  const onInit = useCallback(
    (instance) => {
      reactFlowInstanceRef.current = instance
      setReactFlowInstance(instance)
    },
    [setReactFlowInstance]
  )

  // Trigger fit view when requested
  useEffect(() => {
    if (fitViewTrigger && reactFlowInstanceRef.current) {
      setTimeout(() => {
        reactFlowInstanceRef.current.fitView({ padding: 0.2, duration: 300 })
      }, 50)
    }
  }, [fitViewTrigger])

  // Handle keyboard events (Delete key)
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selectedNodes = localNodes.filter((node) => node.selected)
        if (selectedNodes.length > 0) {
          event.preventDefault()
          const remainingNodes = localNodes.filter((node) => !node.selected)
          setLocalNodes(remainingNodes)
          setNodes(remainingNodes)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [localNodes, setLocalNodes, setNodes])

  return (
    <div className="canvas-container" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={localNodes}
        edges={localEdges}
        onNodesChange={handleNodesChange}
        onInit={onInit}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={4}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
      >
        <Background color="#ddd" gap={20} />
        <MiniMap
          nodeColor={(node) => {
            switch (node.type) {
              case 'imageNode':
                return '#93c5fd'
              case 'videoNode':
                return '#fca5a5'
              case 'textNode':
                return '#fde047'
              case 'fontNode':
                return '#d8b4fe'
              default:
                return '#e5e7eb'
            }
          }}
          maskColor="rgba(255, 255, 255, 0)"
          style={{
            backgroundColor: '#ffffff',
            border: '2px solid #e0e0e0',
            borderRadius: '8px',
          }}
        />
      </ReactFlow>
    </div>
  )
}

export default Canvas
