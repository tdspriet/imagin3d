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
import { WorkspaceContext } from './workspaceContext'
import ImageNode from './nodes/ImageNode'
import VideoNode from './nodes/VideoNode'
import TextNode from './nodes/TextNode'
import FontNode from './nodes/FontNode'
import ModelNode from './nodes/ModelNode'
import ClusterNode from './nodes/ClusterNode'
import ColorPaletteNode from './nodes/ColorPaletteNode'
import './Canvas.css'

// Register custom node types
const nodeTypes = {
  imageNode: ImageNode,
  videoNode: VideoNode,
  textNode: TextNode,
  fontNode: FontNode,
  modelNode: ModelNode,
  clusterNode: ClusterNode,
  paletteNode: ColorPaletteNode,
}

/**
 * Canvas Component
 * Main ReactFlow canvas for the moodboard
 */
function Canvas({ workspaceKey, onActivate, isActive = false }) {
  const nodes = useMoodboardStore((state) => state.workspaces[workspaceKey].nodes)
  const edges = useMoodboardStore((state) => state.workspaces[workspaceKey].edges)
  const fitViewTrigger = useMoodboardStore((state) => state.workspaces[workspaceKey].fitViewTrigger)
  const setNodes = useMoodboardStore((state) => state.setNodes)
  const setReactFlowInstance = useMoodboardStore((state) => state.setReactFlowInstance)
  const isGenerating = useMoodboardStore((s) => s.isGenerating)
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
      const filtered = isGenerating
        ? changes.filter((c) => c.type !== 'position' && c.type !== 'dimensions')
        : changes
      if (filtered.length === 0) return
      const updatedNodes = applyNodeChanges(filtered, localNodes)
      setLocalNodes(updatedNodes)
      setNodes(updatedNodes, workspaceKey)
    },
    [isGenerating, localNodes, setLocalNodes, setNodes, workspaceKey]
  )

  // Handle ReactFlow initialization
  const onInit = useCallback(
    (instance) => {
      reactFlowInstanceRef.current = instance
      setReactFlowInstance(instance, workspaceKey)
    },
    [setReactFlowInstance, workspaceKey]
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
      if (isGenerating) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
          const selectedNodes = localNodes.filter((node) => node.selected)
          if (selectedNodes.length > 0) {
            event.preventDefault()
            const remainingNodes = localNodes.filter((node) => !node.selected)
            setLocalNodes(remainingNodes)
            setNodes(remainingNodes, workspaceKey)
          }
        }
      }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [localNodes, setLocalNodes, setNodes, isGenerating])

  return (
    <WorkspaceContext.Provider value={workspaceKey}>
      <div
        className={`canvas-container${isActive ? ' canvas-container--active' : ''}`}
        ref={reactFlowWrapper}
        onPointerDown={onActivate}
      >
        <ReactFlow
          nodes={localNodes}
          edges={localEdges}
          onNodesChange={handleNodesChange}
          onInit={onInit}
          nodeTypes={nodeTypes}
          nodesConnectable={!isGenerating}
          zoomOnDoubleClick={false}
          fitView
          proOptions={{ hideAttribution: true }}
          minZoom={0.1}
          maxZoom={4}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        >
          <Background color="var(--color-grid-lines)" gap={20} />
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
                case 'modelNode':
                  return '#86efac'
                case 'clusterNode':
                  return '#bdbdbd'
                case 'paletteNode':
                  return '#f97316'
                default:
                  return '#e5e7eb'
              }
            }}
            nodeClassName={(node) =>
              node.type === 'clusterNode'
                ? 'minimap-node minimap-node--cluster'
                : 'minimap-node minimap-node--content'
            }
            maskColor="rgba(0, 0, 0, 0)"
            style={{
              backgroundColor: 'var(--color-reactflow-minimap-bg)',
              border: '2px solid var(--color-border)',
              borderRadius: '8px',
            }}
          />
        </ReactFlow>
      </div>
    </WorkspaceContext.Provider>
  )
}

export default Canvas
