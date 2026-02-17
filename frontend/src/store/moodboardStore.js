import { create } from 'zustand'

// Backend configuration
// NOTE: this should not be hardcoded in production
const BACKEND_URL = 'http://localhost:8000'.replace(/\/$/, '')

// Z-index constants
const SELECTED_Z_OFFSET = 2000
const CLUSTER_Z_OFFSET = -1000
// Default font sizes
const DEFAULT_FONT_SIZE = 16
const FONT_NODE_BASE_SIZE = 24
// Default sizes for various nodes
const DEFAULT_SIZES = {
  TOPBAR_HEIGHT: 60,
  
  IMAGE: { width: 300, height: 200, maxDimension: 400, fallbackAspectRatio: 1.5 },
  VIDEO: { width: 400, height: 225, maxDimension: 450, aspectRatio: 16 / 9 },
  TEXT: { width: 200, height: 40 },
  FONT: { width: 150, height: 40 },
  MODEL: { width: 300, height: 300 },
  PALETTE: { width: 150, height: 100 },
  CLUSTER: { width: 640, height: 420 },
}

const addInitialSize = (data, width, height) => ({
  ...data,
  initialSize: { width, height },
})

const serializeDataForBackend = (nodes = []) => {
  const clusterNodes = nodes.filter(n => n.type === 'clusterNode')
  const contentNodes = nodes.filter(n => n.type !== 'clusterNode')

  // ELEMENTS
  const elements = contentNodes.map((node, index) => {
    return {
      originalId: node.id,
      formatted: {
        id: index + 1,
        content: {
          type: node.type.replace('Node', ''),
          data: sanitizeNodeData(node),
        },
        position: {
          x: Number(node?.position?.x, 0),
          y: Number(node?.position?.y, 0),
        },
        size: computeSizeRatios(node),
      }
    }
  })

  // CLUSTERS
  const nodeIdMap = new Map(elements.map(e => [e.originalId, e.formatted.id]))

  const clusters = clusterNodes.map((cluster, index) => {
    const insideNodeIds = contentNodes
      .filter(node => isNodeInsideCluster(node, cluster))
      .map(node => nodeIdMap.get(node.id))
      .sort((a, b) => a - b)

    return {
      originalId: cluster.id,
      formatted: {
        id: index + 1,
        title: cluster.data?.title || 'Cluster',
        elements: insideNodeIds
      }
    }
  })

  // REVERSE ID MAPS
  const reverseNodeIdMap = new Map(elements.map(e => [e.formatted.id, e.originalId]))
  const reverseClusterIdMap = new Map(clusters.map(c => [c.formatted.id, c.originalId]))

  return {
    payload: {
      elements: elements.map(e => e.formatted),
      clusters: clusters.map(c => c.formatted)
    },
    idMaps: {
      elements: reverseNodeIdMap,  // backend ID -> frontend ID
      clusters: reverseClusterIdMap  // backend ID -> frontend ID
    }
  }
}

const sanitizeNodeData = (node = {}) => {
  const data = node?.data || {}
  const { initialSize, aspectRatio, ...rest } = data
  if (node.type === 'fontNode') {
    const { fontSize, baseFontSize, ...fontRest } = rest
    return fontRest
  }
  if (node.type === 'textNode') {
    const { fontSize, ...textRest } = rest
    return textRest
  }
  return rest
}

const computeSizeRatios = (node) => {
  if (node.type === 'fontNode' || node.type === 'textNode') {
    const currentFontSize = Number(node?.data?.fontSize, DEFAULT_FONT_SIZE)
    const defaultFontSize = DEFAULT_FONT_SIZE
    const ratio = currentFontSize / defaultFontSize
    return { x: ratio, y: ratio }
  }

  const width = Number(node?.style?.width, Number(node?.width, 1))
  const height = Number(node?.style?.height, Number(node?.height, 1))
  const initialWidth = Number(node?.data?.initialSize?.width, width || 1)
  const initialHeight = Number(node?.data?.initialSize?.height, height || 1)

  return {
    x: initialWidth ? width / initialWidth : 1,
    y: initialHeight ? height / initialHeight : 1,
  }
}


const applyLayerOrder = (nodes, isGenerating = false) => {
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
    const baseZIndex = isClusterNode ? CLUSTER_Z_OFFSET + clusterCounter : contentCounter + 1
    const isSelected = Boolean(node.selected)

    if (isClusterNode) {
      clusterCounter += 1
    } else {
      contentCounter += 1
    }

    const selectionOffset = isSelected
      ? (isClusterNode && !isGenerating ? 500 : SELECTED_Z_OFFSET)
      : 0

    return {
      ...node,
      style: {
        ...(node.style || {}),
        zIndex: baseZIndex + selectionOffset,
      },
    }
  })
}

const isNodeInsideCluster = (node, cluster) => {
  const nodeX = Number(node.position.x)
  const nodeY = Number(node.position.y)
  const nodeW = Number(node.style?.width || node.width || 0)
  const nodeH = Number(node.style?.height || node.height || 0)
  
  const clusterX = Number(cluster.position.x)
  const clusterY = Number(cluster.position.y)
  const clusterW = Number(cluster.style?.width || cluster.width || 0)
  const clusterH = Number(cluster.style?.height || cluster.height || 0)

  // Check if center of node is inside cluster
  const centerX = nodeX + nodeW / 2
  const centerY = nodeY + nodeH / 2

  return (
    centerX >= clusterX &&
    centerX <= clusterX + clusterW &&
    centerY >= clusterY &&
    centerY <= clusterY + clusterH
  )
}

const buildEditedWeightsPayload = (nodes = [], idMaps = null) => {
  if (!idMaps) {
    return { weights: {}, cluster_weights: {} }
  }

  const nodeLookup = new Map(nodes.map((node) => [node.id, node]))
  const weights = {}
  const cluster_weights = {}

  if (idMaps.elements instanceof Map) {
    for (const [backendId, frontendId] of idMaps.elements.entries()) {
      const node = nodeLookup.get(frontendId)
      if (typeof node?.data?.weight === 'number') {
        weights[backendId] = Math.max(0, Math.min(100, Math.round(node.data.weight)))
      }
    }
  }

  if (idMaps.clusters instanceof Map) {
    for (const [backendId, frontendId] of idMaps.clusters.entries()) {
      const node = nodeLookup.get(frontendId)
      if (typeof node?.data?.weight === 'number') {
        cluster_weights[backendId] = Math.max(0, Math.min(100, Math.round(node.data.weight)))
      }
    }
  }

  return { weights, cluster_weights }
}

/**
 * Moodboard Store
 * Manages the state of all nodes and canvas operations
 */
export const useMoodboardStore = create((set, get) => ({
  // State
  nodes: [],
  edges: [],
  reactFlowInstance: null,
  fitViewTrigger: 0,
  isGenerating: false,
  // Weights session
  weightsSessionId: null,
  weightsIdMaps: null,
  awaitingWeightsConfirmation: false,
  // Master prompt session
  masterPromptSessionId: null,
  awaitingMasterPromptConfirmation: false,
  masterPromptData: null, // { prompt, image, referenceImages }
  masterPromptIsLoading: false,
  progress: {
    current: 0,
    total: 0,
    stage: '',
  },
  // Model dialog state
  modelDialog: {
    isOpen: false,
    modelUrl: null,
  },
  score: null,

  // Set ReactFlow instance
  setReactFlowInstance: (instance) => set({ reactFlowInstance: instance }),

  // Set nodes
  setNodes: (nodes) => set((state) => ({ nodes: applyLayerOrder(nodes, state.isGenerating) })),

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

  updateNodeWeight: (nodeId, nextWeight) => {
    const w = Math.max(0, Math.min(100, Math.round(Number(nextWeight) || 0)))
    get().updateNodeData(nodeId, { weight: w })
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
      return { nodes: applyLayerOrder(updatedNodes, state.isGenerating) }
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
      return { nodes: applyLayerOrder(reordered, state.isGenerating) }
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
      return { nodes: applyLayerOrder(reordered, state.isGenerating) }
    })
  },

  // Get center position of current viewport
  getCenterPosition: () => {
    const { reactFlowInstance } = get()

    const { x, y, zoom } = reactFlowInstance.getViewport()

    // Calculate center of visible area
    const centerX = (window.innerWidth / 2 - x) / zoom
    const centerY = ((window.innerHeight - DEFAULT_SIZES.TOPBAR_HEIGHT) / 2 - y) / zoom // Subtract topbar height

    return { x: centerX, y: centerY }
  },

  // Add image node
  addImage: (src) => {
    const position = get().getCenterPosition()
    const nodeId = `image-${Date.now()}`
    const image = new Image()

    const appendNode = (width, height, aspectRatio) => {
      const safeWidth = Number.isFinite(width) && width > 0 ? width : DEFAULT_SIZES.IMAGE.width
      const safeHeight = Number.isFinite(height) && height > 0 ? height : DEFAULT_SIZES.IMAGE.height
      const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : safeWidth / safeHeight

      const newNode = {
        id: nodeId,
        type: 'imageNode',
        position,
        data: addInitialSize({ src, aspectRatio: ratio }, safeWidth, safeHeight),
        style: { width: safeWidth, height: safeHeight },
      }

      set((state) => ({
        nodes: applyLayerOrder([...state.nodes, newNode], state.isGenerating),
      }))
    }

    image.onload = () => {
      const naturalWidth = image.naturalWidth || DEFAULT_SIZES.IMAGE.width
      const naturalHeight = image.naturalHeight || DEFAULT_SIZES.IMAGE.height
      const maxDimension = DEFAULT_SIZES.IMAGE.maxDimension
      const dominantSize = Math.max(naturalWidth, naturalHeight)
      const scale = dominantSize > maxDimension ? maxDimension / dominantSize : 1
      const width = naturalWidth * scale
      const height = naturalHeight * scale
      appendNode(width, height, naturalWidth / naturalHeight)
    }

    image.onerror = () => {
      appendNode(DEFAULT_SIZES.IMAGE.width, DEFAULT_SIZES.IMAGE.height, DEFAULT_SIZES.IMAGE.fallbackAspectRatio)
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
      const safeWidth = Number.isFinite(width) && width > 0 ? width : DEFAULT_SIZES.VIDEO.width
      const safeHeight = Number.isFinite(height) && height > 0 ? height : DEFAULT_SIZES.VIDEO.height
      const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : safeWidth / safeHeight

      const newNode = {
        id: nodeId,
        type: 'videoNode',
        position,
        data: addInitialSize({ src, aspectRatio: ratio }, safeWidth, safeHeight),
        style: { width: safeWidth, height: safeHeight },
      }

      set((state) => ({
        nodes: applyLayerOrder([...state.nodes, newNode], state.isGenerating),
      }))
    }

    const handleLoadedMetadata = () => {
      const naturalWidth = video.videoWidth || DEFAULT_SIZES.VIDEO.width
      const naturalHeight = video.videoHeight || DEFAULT_SIZES.VIDEO.height
      const maxDimension = DEFAULT_SIZES.VIDEO.maxDimension
      const dominantSize = Math.max(naturalWidth, naturalHeight)
      const scale = dominantSize > maxDimension ? maxDimension / dominantSize : 1
      const width = naturalWidth * scale
      const height = naturalHeight * scale
      appendNode(width, height, naturalWidth / naturalHeight)
      cleanup()
    }

    const handleError = () => {
      appendNode(DEFAULT_SIZES.VIDEO.width, DEFAULT_SIZES.VIDEO.height, DEFAULT_SIZES.VIDEO.aspectRatio)
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
    const width = DEFAULT_SIZES.TEXT.width
    const height = DEFAULT_SIZES.TEXT.height
    const newNode = {
      id: `text-${Date.now()}`,
      type: 'textNode',
      position,
      data: addInitialSize({ text: 'Double-click to edit', fontSize: DEFAULT_FONT_SIZE }, width, height),
      style: { width, height },
    }
    set((state) => ({
      nodes: applyLayerOrder([...state.nodes, newNode], state.isGenerating),
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
    
    const width = DEFAULT_SIZES.FONT.width
    const height = DEFAULT_SIZES.FONT.height
    const baseFontSize = FONT_NODE_BASE_SIZE
    const newNode = {
      id: nodeId,
      type: 'fontNode',
      position,
      data: addInitialSize({
        fontFamily: fontName,
        fontSize: baseFontSize,
        baseFontSize,
        fontLoaded: true,
        uniqueFontFamily: uniqueFontFamily,
        fontData: fontData,
      }, width, height),
      style: { width, height },
    }
    set((state) => ({
      nodes: applyLayerOrder([...state.nodes, newNode], state.isGenerating),
    }))
  },

  // Add 3D model node
  addModel: (src, fileName) => {
    const position = get().getCenterPosition()
    const nodeId = `model-${Date.now()}`
    
    const width = DEFAULT_SIZES.MODEL.width
    const height = DEFAULT_SIZES.MODEL.height
    const newNode = {
      id: nodeId,
      type: 'modelNode',
      position,
      data: addInitialSize({ 
        src,
        fileName: fileName || 'model.glb'
      }, width, height),
      dragHandle: '.react-flow-drag-handle',
      style: { width, height },
    }
    
    set((state) => ({
      nodes: applyLayerOrder([...state.nodes, newNode], state.isGenerating),
    }))
  },

  // Add palette node
  addPalette: (colors, options = {}) => {
    const paletteColors = Array.isArray(colors) ? [...colors] : []
    const position = get().getCenterPosition()
    const width = Number.isFinite(options.width) ? options.width : DEFAULT_SIZES.PALETTE.width
    const height = Number.isFinite(options.height) ? options.height : DEFAULT_SIZES.PALETTE.height
    const nodeId = `palette-${Date.now()}`

    const newNode = {
      id: nodeId,
      type: 'paletteNode',
      position,
      data: addInitialSize({
        colors: paletteColors,
        origin: options.origin || 'manual',
      }, width, height),
      style: { width, height },
    }

    set((state) => ({
      nodes: applyLayerOrder([...state.nodes, newNode], state.isGenerating),
    }))
  },

  // Add cluster node
  addCluster: (title) => {
    const position = get().getCenterPosition()
    const clusterTitle =
      typeof title === 'string' && title.trim().length > 0 ? title.trim() : 'Cluster'

    const width = DEFAULT_SIZES.CLUSTER.width
    const height = DEFAULT_SIZES.CLUSTER.height
    const newNode = {
      id: `cluster-${Date.now()}`,
      type: 'clusterNode',
      position,
      data: addInitialSize({ title: clusterTitle }, width, height),
      dragHandle: '.cluster-node-header',
      style: { width, height },
    }

    set((state) => ({
      nodes: applyLayerOrder([...state.nodes, newNode], state.isGenerating),
    }))
  },

  // Fit view to show all content
  fitView: () => {
    set((state) => ({ fitViewTrigger: state.fitViewTrigger + 1 }))
  },

  // Clear weights from all nodes
  clearWeights: () => {
    set((state) => ({
      nodes: state.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          weight: undefined,
        },
      })),
    }))
  },

  // Clear all nodes
  clearAll: () => {
    if (confirm('Are you sure you want to clear all elements?')) {
      set({ nodes: [], edges: [] })
    }
  },

  // Helper to apply weights to nodes
  applyWeights: (weightsData, idMaps) => {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        const map = node.type === 'clusterNode' ? idMaps.clusters : idMaps.elements
        const source = node.type === 'clusterNode' ? weightsData.cluster_weights : weightsData.weights
        for (const [backendId, frontendId] of map.entries()) {
          if (frontendId === node.id && source?.[backendId] != null) {
            return { ...node, data: { ...node.data, weight: source[backendId] } }
          }
        }
        return node
      }),
    }))
  },

  // Send moodboard generation request to backend
  generateMoodboard: async (prompt = '') => {
    const { nodes, applyWeights } = get()
    const { payload, idMaps } = serializeDataForBackend(nodes)

    // If no elements or clusters, skip generation
    if ((!payload.elements || payload.elements.length === 0) && (!payload.clusters || payload.clusters.length === 0)) {
      return { weights: {}, cluster_weights: {} }
    }

    // Add the user prompt to the payload
    payload.prompt = prompt

    set({ 
      isGenerating: true, 
      awaitingWeightsConfirmation: false, 
      weightsSessionId: null,
      weightsIdMaps: null,
      awaitingMasterPromptConfirmation: false,
      masterPromptSessionId: null,
      masterPromptData: null,
      masterPromptIsLoading: false,
      progress: { current: 0, total: 0, stage: 'Starting...' },
      score: null,
    })
    try {
      const response = await fetch(`${BACKEND_URL}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('Backend generation failed')
      }

      // Parse SSE stream
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalResult = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events from buffer (format: data: {json}\n\n)
        const events = buffer.split('\n\n')
        buffer = events.pop() || '' // Keep incomplete event in buffer

        for (const event of events) {
          if (!event.trim()) continue

          // Extract data from "data: {json}" format
          const dataMatch = event.match(/^data:\s*(.+)$/m)
          if (!dataMatch) continue

          try {
            const parsed = JSON.parse(dataMatch[1])
            const { type, data, session_id } = parsed

            if (type === 'progress') {
              // Update progress
              set({ progress: data })
            } else if (type === 'weights') {
              // Apply weights immediately when received
              applyWeights(data, idMaps)
              // Store session ID and set awaiting confirmation
              if (session_id) {
                set({ 
                  weightsSessionId: session_id, 
                  weightsIdMaps: idMaps,
                  awaitingWeightsConfirmation: true,
                  progress: { current: 0, total: 0, stage: '' }, // Clear progress
                })
              }
            } else if (type === 'complete') {
              // Store final result
              finalResult = data
              set({
                awaitingWeightsConfirmation: false,
                weightsSessionId: null,
                weightsIdMaps: null,
                awaitingMasterPromptConfirmation: false,
                masterPromptSessionId: null,
                masterPromptData: null,
                masterPromptIsLoading: false,
              })
              
              // Open model dialog
              if (data.file) {
                  const url = data.file.startsWith('http') ? data.file : `${BACKEND_URL}${data.file}`
                  get().openModelDialog(url)
              }
            } else if (type === 'cancelled') {
              // Pipeline was cancelled
              set({
                awaitingWeightsConfirmation: false,
                weightsSessionId: null,
                weightsIdMaps: null,
                awaitingMasterPromptConfirmation: false,
                masterPromptSessionId: null,
                masterPromptData: null,
                masterPromptIsLoading: false,
              })
              return { cancelled: true }
            } else if (type === 'master_prompt') {
              // Master prompt and image received
              if (session_id) {
                set({ 
                  masterPromptSessionId: session_id, 
                  awaitingMasterPromptConfirmation: true,
                  masterPromptData: {
                    prompt: data.prompt,
                    image: data.image,
                    referenceImages: data.reference_images || [],
                  },
                  masterPromptIsLoading: false,
                  progress: { current: 0, total: 0, stage: '' }, // Clear progress
                })
              }
            } else if (type === 'score') {
              set({ score: data.score })
            } else if (type === 'error') {
              console.error('Backend error:', data)
              throw new Error(data)
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e)
          }
        }
      }

      return finalResult || {}
    } catch (error) {
      console.error('Error generating moodboard:', error)
      throw error
    } finally {
      set({ 
        isGenerating: false, 
        awaitingWeightsConfirmation: false, 
        weightsSessionId: null,
        weightsIdMaps: null,
        awaitingMasterPromptConfirmation: false,
        masterPromptSessionId: null,
        masterPromptData: null,
        masterPromptIsLoading: false,
        progress: { current: 0, total: 0, stage: '' },
      })
    }
  },

  // Confirm weights to continue the pipeline
  confirmWeights: async () => {
    const { weightsSessionId, weightsIdMaps, nodes, clearWeights } = get()
    if (!weightsSessionId) return
    const editedWeightsPayload = buildEditedWeightsPayload(nodes, weightsIdMaps)

    // Hide confirmation bar immediately to make way for progress bar
    set({ awaitingWeightsConfirmation: false, weightsSessionId: null, weightsIdMaps: null })

    try {
      await fetch(`${BACKEND_URL}/confirm-weights/${weightsSessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmed: true,
          ...editedWeightsPayload,
        }),
      })
      // Clear weight visualization
      clearWeights()
    } catch (error) {
      console.error('Error confirming weights:', error)
    }
  },

  // Cancel weights to stop the pipeline
  cancelWeights: async () => {
    const { weightsSessionId, clearWeights } = get()
    if (!weightsSessionId) return

    try {
      await fetch(`${BACKEND_URL}/confirm-weights/${weightsSessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: false }),
      })
      set({ weightsIdMaps: null })
      // Clear weight visualization
      clearWeights()
    } catch (error) {
      console.error('Error cancelling weights:', error)
    }
  },

  // Confirm master prompt to continue the pipeline
  confirmMasterPrompt: async () => {
    const { masterPromptSessionId } = get()
    if (!masterPromptSessionId) return

    try {
      await fetch(`${BACKEND_URL}/confirm-weights/${masterPromptSessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      })
      set({
        awaitingMasterPromptConfirmation: false,
        masterPromptSessionId: null,
        masterPromptData: null,
        masterPromptIsLoading: false,
      })
    } catch (error) {
      console.error('Error confirming master prompt:', error)
    }
  },

  // Cancel master prompt to stop the pipeline
  cancelMasterPrompt: async () => {
    const { masterPromptSessionId } = get()
    if (!masterPromptSessionId) return

    try {
      await fetch(`${BACKEND_URL}/confirm-weights/${masterPromptSessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: false }),
      })
      set({
        awaitingMasterPromptConfirmation: false,
        masterPromptSessionId: null,
        masterPromptData: null,
        masterPromptIsLoading: false,
      })
    } catch (error) {
      console.error('Error cancelling master prompt:', error)
    }
  },

  regenerateMasterPromptImage: async (prompt) => {
    const { masterPromptSessionId } = get()
    const nextPrompt = (prompt || '').trim()
    if (!masterPromptSessionId || !nextPrompt) return

    set({ masterPromptIsLoading: true })
    try {
      const response = await fetch(`${BACKEND_URL}/master-prompt/${masterPromptSessionId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: nextPrompt }),
      })
      if (!response.ok) {
        throw new Error(`Failed to regenerate master image (${response.status})`)
      }

      const data = await response.json()
      set((state) => ({
        masterPromptData: state.masterPromptData
          ? {
              ...state.masterPromptData,
              image: data.image || state.masterPromptData.image,
            }
          : {
              prompt: nextPrompt,
              image: data.image || '',
              referenceImages: [],
            },
      }))
    } catch (error) {
      console.error('Error regenerating master prompt image:', error)
    } finally {
      set({ masterPromptIsLoading: false })
    }
  },

  editMasterPromptImage: async (editPrompt) => {
    const { masterPromptSessionId, masterPromptData } = get()
    const nextEditPrompt = (editPrompt || '').trim()
    if (!masterPromptSessionId || !masterPromptData?.image || !nextEditPrompt) return

    set({ masterPromptIsLoading: true })
    try {
      const response = await fetch(`${BACKEND_URL}/master-prompt/${masterPromptSessionId}/edit-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: nextEditPrompt,
          image: masterPromptData.image,
        }),
      })
      if (!response.ok) {
        throw new Error(`Failed to edit master image (${response.status})`)
      }

      const data = await response.json()
      set((state) => ({
        masterPromptData: state.masterPromptData
          ? { ...state.masterPromptData, image: data.image || state.masterPromptData.image }
          : state.masterPromptData,
      }))
    } catch (error) {
      console.error('Error editing master prompt image:', error)
    } finally {
      set({ masterPromptIsLoading: false })
    }
  },

  openModelDialog: (url) => set({ modelDialog: { isOpen: true, modelUrl: url } }),
  closeModelDialog: () => set({ modelDialog: { isOpen: false, modelUrl: null } }),

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
        set((state) => ({
          nodes: applyLayerOrder(data.nodes, state.isGenerating),
          edges: [],
        }))
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
