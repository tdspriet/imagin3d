import { create } from 'zustand'

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
  setNodes: (nodes) => set({ nodes }),

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
                ...node.style,
                ...dimensions,
              },
            }
          : node
      ),
    }))

    const instance = get().reactFlowInstance
    if (instance && typeof instance.updateNodeInternals === 'function') {
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
      return { nodes: updatedNodes }
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

      set((state) => ({ nodes: [...state.nodes, newNode] }))
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

      set((state) => ({ nodes: [...state.nodes, newNode] }))
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
    set((state) => ({ nodes: [...state.nodes, newNode] }))
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
    set((state) => ({ nodes: [...state.nodes, newNode] }))
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
        set({ nodes: data.nodes, edges: [] })
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
