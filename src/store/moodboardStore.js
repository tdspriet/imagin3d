import { create } from 'zustand'

const SELECTED_Z_OFFSET = 1000

const applyLayerOrder = (nodes) => {
  const clusterNodes = []
  const contentNodes = []

  nodes.forEach((node) => {
    const isModelNode = node.type === 'modelNode'
    const isClusterNode = node.type === 'clusterNode'

    const dragHandle = isModelNode
      ? node.dragHandle || '.react-flow-drag-handle'
      : isClusterNode
        ? node.dragHandle || '.cluster-node-header'
        : node.dragHandle

    const baseNode = {
      ...node,
      dragHandle,
    }

    if (isClusterNode) {
      clusterNodes.push(baseNode)
    } else {
      contentNodes.push(baseNode)
    }
  })

  const orderedNodes = [...clusterNodes, ...contentNodes]
  let clusterCounter = 0
  let contentCounter = 0

  return orderedNodes.map((node) => {
    const isClusterNode = node.type === 'clusterNode'
    const baseZIndex = isClusterNode ? -1000 + clusterCounter : contentCounter + 1
    const isSelected = Boolean(node.selected)

    if (isClusterNode) {
      clusterCounter += 1
    } else {
      contentCounter += 1
    }

    return {
      ...node,
      style: {
        ...(node.style || {}),
        zIndex: baseZIndex + (isSelected ? SELECTED_Z_OFFSET : 0),
      },
    }
  })
}

/**
 * Moodboard Store
 * Manages the state of all nodes and canvas operations
 * Uses Zustand for simple and efficient state management
 */
export const useMoodboardStore = create((set, get) => ({
  // State
  nodes: [],
  edges: [],
  reactFlowInstance: null,
  fitViewTrigger: 0,

  // Set ReactFlow instance
  setReactFlowInstance: (instance) => set({ reactFlowInstance: instance }),

  // Set nodes
  setNodes: (nodes) => set({ nodes: applyLayerOrder(nodes) }),

  // Update specific node data
  updateNodeData: (nodeId, newData) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...newData } }
          : node
      ),
    }))
  },

  // Update node style dimensions (width/height)
  setNodeDimensions: (nodeId, dimensions) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              style: {
                ...(node.style || {}),
                ...dimensions,
              },
            }
          : node
      ),
    }))

    const instance = get().reactFlowInstance
    if (instance?.updateNodeInternals) {
      requestAnimationFrame(() => instance.updateNodeInternals(nodeId))
    }
  },

  // Handle node changes from ReactFlow
  onNodesChange: (changes) => {
    set((state) => {
      // Apply changes manually to maintain control
      const updatedNodes = [...state.nodes]
      changes.forEach((change) => {
        const nodeIndex = updatedNodes.findIndex((n) => n.id === change.id)
        if (nodeIndex !== -1) {
          if (change.type === 'position' && change.position) {
            updatedNodes[nodeIndex] = {
              ...updatedNodes[nodeIndex],
              position: change.position,
            }
          } else if (change.type === 'dimensions' && change.dimensions) {
            updatedNodes[nodeIndex] = {
              ...updatedNodes[nodeIndex],
              style: {
                ...updatedNodes[nodeIndex].style,
                width: change.dimensions.width,
                height: change.dimensions.height,
              },
            }
          } else if (change.type === 'select') {
            updatedNodes[nodeIndex] = {
              ...updatedNodes[nodeIndex],
              selected: change.selected,
            }
          }
        }
      })
      return { nodes: applyLayerOrder(updatedNodes) }
    })
  },

  // Move node one layer forward (on top)
  bringNodeForward: (nodeId) => {
    set((state) => {
      const index = state.nodes.findIndex((node) => node.id === nodeId)
      if (index === -1 || state.nodes[index]?.type === 'clusterNode' || index === state.nodes.length - 1) {
        return {}
      }

      const reordered = [...state.nodes]
      const [node] = reordered.splice(index, 1)
      reordered.splice(index + 1, 0, node)
      return { nodes: applyLayerOrder(reordered) }
    })
  },

  // Move node one layer backward (to bottom)
  sendNodeBackward: (nodeId) => {
    set((state) => {
      const index = state.nodes.findIndex((node) => node.id === nodeId)
      if (index <= 0 || state.nodes[index]?.type === 'clusterNode') {
        return {}
      }

      const reordered = [...state.nodes]
      const [node] = reordered.splice(index, 1)
      reordered.splice(index - 1, 0, node)
      return { nodes: applyLayerOrder(reordered) }
    })
  },

  // Get center position of current viewport
  getCenterPosition: () => {
    const { reactFlowInstance } = get()
    if (!reactFlowInstance) return { x: 250, y: 250 }

    const viewport = reactFlowInstance.getViewport()
    const { x, y, zoom } = viewport
    const bounds = reactFlowInstance.getViewport()

    // Calculate center of visible area
    const centerX = (window.innerWidth / 2 - x) / zoom
    const centerY = ((window.innerHeight - 60) / 2 - y) / zoom // Subtract topbar height

    return { x: centerX, y: centerY }
  },

  // Add image node
  addImage: (src) => {
    const position = get().getCenterPosition()
    const nodeId = `image-${Date.now()}`
    const image = new Image()

    const appendNode = (width, height, aspectRatio) => {
      const safeWidth = Number.isFinite(width) && width > 0 ? width : 300
      const safeHeight = Number.isFinite(height) && height > 0 ? height : 200
      const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : safeWidth / safeHeight

      const newNode = {
        id: nodeId,
        type: 'imageNode',
        position,
        data: { src, aspectRatio: ratio },
        style: { width: safeWidth, height: safeHeight },
      }

      set((state) => ({
        nodes: applyLayerOrder([...state.nodes, newNode]),
      }))
    }

    image.onload = () => {
      const naturalWidth = image.naturalWidth || 300
      const naturalHeight = image.naturalHeight || 200
      const maxDimension = 400
      const dominantSize = Math.max(naturalWidth, naturalHeight)
      const scale = dominantSize > maxDimension ? maxDimension / dominantSize : 1
      const width = naturalWidth * scale
      const height = naturalHeight * scale
      appendNode(width, height, naturalWidth / naturalHeight)
    }

    image.onerror = () => {
      appendNode(300, 200, 1.5)
    }

    image.src = src
  },

  // Add video node
  addVideo: (src) => {
    const position = get().getCenterPosition()
    const nodeId = `video-${Date.now()}`
    const video = document.createElement('video')
    video.preload = 'metadata'

    const appendNode = (width, height, aspectRatio) => {
      const safeWidth = Number.isFinite(width) && width > 0 ? width : 400
      const safeHeight = Number.isFinite(height) && height > 0 ? height : 225
      const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : safeWidth / safeHeight

      const newNode = {
        id: nodeId,
        type: 'videoNode',
        position,
        data: { src, aspectRatio: ratio },
        style: { width: safeWidth, height: safeHeight },
      }

      set((state) => ({
        nodes: applyLayerOrder([...state.nodes, newNode]),
      }))
    }

    const handleLoadedMetadata = () => {
      const naturalWidth = video.videoWidth || 400
      const naturalHeight = video.videoHeight || 225
      const maxDimension = 450
      const dominantSize = Math.max(naturalWidth, naturalHeight)
      const scale = dominantSize > maxDimension ? maxDimension / dominantSize : 1
      const width = naturalWidth * scale
      const height = naturalHeight * scale
      appendNode(width, height, naturalWidth / naturalHeight)
      cleanup()
    }

    const handleError = () => {
      appendNode(400, 225, 16 / 9)
      cleanup()
    }

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('error', handleError)
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('error', handleError)
    video.src = src
  },

  // Add text node
  addText: () => {
    const position = get().getCenterPosition()
    const newNode = {
      id: `text-${Date.now()}`,
      type: 'textNode',
      position,
      data: { text: 'Double-click to edit', fontSize: 16 },
      style: { width: 200, height: 40 },
    }
    set((state) => ({
      nodes: applyLayerOrder([...state.nodes, newNode]),
    }))
  },

  // Add font node
  addFont: (fontData, fontName) => {
    const position = get().getCenterPosition()
    const nodeId = `font-${Date.now()}`
    const uniqueFontFamily = `CustomFont-${nodeId}`
    
    // Create a style element to load the font
    const style = document.createElement('style')
    style.textContent = `
      @font-face {
        font-family: '${uniqueFontFamily}';
        src: url(${fontData});
      }
    `
    document.head.appendChild(style)
    
    const newNode = {
      id: nodeId,
      type: 'fontNode',
      position,
      data: { 
        fontFamily: fontName, 
        fontSize: 24, 
        fontLoaded: true,
        uniqueFontFamily: uniqueFontFamily,
        fontData: fontData
      },
      style: { width: 150, height: 40 },
    }
    set((state) => ({
      nodes: applyLayerOrder([...state.nodes, newNode]),
    }))
  },

  // Add 3D model node
  addModel: (src, fileName) => {
    const position = get().getCenterPosition()
    const nodeId = `model-${Date.now()}`
    
    const newNode = {
      id: nodeId,
      type: 'modelNode',
      position,
      data: { 
        src,
        fileName: fileName || 'model.glb'
      },
      dragHandle: '.react-flow-drag-handle',
      style: { width: 300, height: 300 },
    }
    
    set((state) => ({
      nodes: applyLayerOrder([...state.nodes, newNode]),
    }))
  },

  // Add palette node
  addPalette: (colors, options = {}) => {
    const paletteColors = Array.isArray(colors) ? [...colors] : []
    const position = get().getCenterPosition()
    const width = Number.isFinite(options.width) ? options.width : 150
    const height = Number.isFinite(options.height) ? options.height : 100
    const nodeId = `palette-${Date.now()}`

    const newNode = {
      id: nodeId,
      type: 'paletteNode',
      position,
      data: {
        colors: paletteColors,
        origin: options.origin || 'manual',
      },
      style: { width, height },
    }

    set((state) => ({
      nodes: applyLayerOrder([...state.nodes, newNode]),
    }))
  },

  // Add cluster node
  addCluster: (title) => {
    const position = get().getCenterPosition()
    const clusterTitle =
      typeof title === 'string' && title.trim().length > 0 ? title.trim() : 'Cluster'

    const newNode = {
      id: `cluster-${Date.now()}`,
      type: 'clusterNode',
      position,
      data: { title: clusterTitle },
      dragHandle: '.cluster-node-header',
      style: { width: 640, height: 420 },
    }

    set((state) => ({
      nodes: applyLayerOrder([...state.nodes, newNode]),
    }))
  },

  // Fit view to show all content
  fitView: () => {
    set((state) => ({ fitViewTrigger: state.fitViewTrigger + 1 }))
  },

  // Clear all nodes
  clearAll: () => {
    if (confirm('Are you sure you want to clear all elements?')) {
      set({ nodes: [], edges: [] })
    }
  },

  // Save moodboard to JSON file
  saveMoodboard: () => {
    const { nodes } = get()
    const moodboardData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      nodes: nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data,
        style: node.style,
      })),
    }

    const dataStr = JSON.stringify(moodboardData, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `moodboard-${Date.now()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  },

  // Load moodboard from JSON data
  loadMoodboard: (data) => {
    try {
      if (data.nodes && Array.isArray(data.nodes)) {
        set({
          nodes: applyLayerOrder(data.nodes),
          edges: [],
        })
        // Trigger fit view after loading
        setTimeout(() => {
          set((state) => ({ fitViewTrigger: state.fitViewTrigger + 1 }))
        }, 100)
      }
    } catch (error) {
      console.error('Error loading moodboard:', error)
      alert('Error loading moodboard')
    }
  },
}))
