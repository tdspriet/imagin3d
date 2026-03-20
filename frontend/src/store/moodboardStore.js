import { create } from 'zustand'

const BACKEND_URL = 'http://localhost:8000'.replace(/\/$/, '')
const WORKSPACE_KEYS = {
  SINGLE: 'single',
  LEFT: 'left',
  RIGHT: 'right',
}
const SELECTED_Z_OFFSET = 2000
const CLUSTER_Z_OFFSET = -1000
const DEFAULT_FONT_SIZE = 16
const FONT_NODE_BASE_SIZE = 24

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

const createWorkspaceState = () => ({
  nodes: [],
  edges: [],
  reactFlowInstance: null,
  fitViewTrigger: 0,
})

const createComparisonResults = () => ({
  left: { status: 'idle', message: 'Ready', modelUrl: null, score: null },
  right: { status: 'idle', message: 'Ready', modelUrl: null, score: null },
})

const addInitialSize = (data, width, height) => ({
  ...data,
  initialSize: { width, height },
})

const cloneSerializable = (value) => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value))
}

const cloneWorkspaceState = (workspace) => ({
  nodes: cloneSerializable(workspace.nodes || []),
  edges: cloneSerializable(workspace.edges || []),
  reactFlowInstance: null,
  fitViewTrigger: 0,
})

const resolveWorkspaceKey = (state, workspaceKey = null) => {
  if (workspaceKey) return workspaceKey
  if (state.mode === 'comparative') {
    return state.activeWorkspaceKey === WORKSPACE_KEYS.RIGHT ? WORKSPACE_KEYS.RIGHT : WORKSPACE_KEYS.LEFT
  }
  return WORKSPACE_KEYS.SINGLE
}

const getWorkspace = (state, workspaceKey = null) => {
  return state.workspaces[resolveWorkspaceKey(state, workspaceKey)]
}

const updateWorkspaceState = (state, workspaceKey, updater) => {
  const key = resolveWorkspaceKey(state, workspaceKey)
  const workspace = state.workspaces[key]
  const next = typeof updater === 'function' ? updater(workspace) : updater
  return {
    workspaces: {
      ...state.workspaces,
      [key]: {
        ...workspace,
        ...next,
      },
    },
  }
}

const serializeDataForBackend = (nodes = []) => {
  const clusterNodes = nodes.filter((n) => n.type === 'clusterNode')
  const contentNodes = nodes.filter((n) => n.type !== 'clusterNode')

  const elements = contentNodes.map((node, index) => ({
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
    },
  }))

  const nodeIdMap = new Map(elements.map((e) => [e.originalId, e.formatted.id]))

  const clusters = clusterNodes.map((cluster, index) => {
    const insideNodeIds = contentNodes
      .filter((node) => isNodeInsideCluster(node, cluster))
      .map((node) => nodeIdMap.get(node.id))
      .sort((a, b) => a - b)

    return {
      originalId: cluster.id,
      formatted: {
        id: index + 1,
        title: cluster.data?.title || 'Cluster',
        elements: insideNodeIds,
      },
    }
  })

  const reverseNodeIdMap = new Map(elements.map((e) => [e.formatted.id, e.originalId]))
  const reverseClusterIdMap = new Map(clusters.map((c) => [c.formatted.id, c.originalId]))

  return {
    payload: {
      elements: elements.map((e) => e.formatted),
      clusters: clusters.map((c) => c.formatted),
    },
    idMaps: {
      elements: reverseNodeIdMap,
      clusters: reverseClusterIdMap,
    },
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
    return { x: currentFontSize / DEFAULT_FONT_SIZE, y: currentFontSize / DEFAULT_FONT_SIZE }
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

    const baseNode = { ...node, dragHandle }
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
  if (!idMaps) return { weights: {}, cluster_weights: {} }

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

const updateComparisonResult = (results, pane, patch) => ({
  ...results,
  [pane]: {
    ...results[pane],
    ...patch,
  },
})

const anyMasterPromptLoading = (loadingState) => Object.values(loadingState).some(Boolean)

export const useMoodboardStore = create((set, get) => ({
  mode: 'single',
  activeWorkspaceKey: WORKSPACE_KEYS.SINGLE,
  workspaces: {
    single: createWorkspaceState(),
    left: createWorkspaceState(),
    right: createWorkspaceState(),
  },
  isGenerating: false,
  generationMode: 'single',
  weightsSessionId: null,
  weightsIdMaps: null,
  awaitingWeightsConfirmation: false,
  masterPromptSessionId: null,
  awaitingMasterPromptConfirmation: false,
  masterPromptData: null,
  masterPromptLoadingByPane: {
    single: false,
    left: false,
    right: false,
  },
  progress: {
    current: 0,
    total: 0,
    stage: '',
  },
  modelDialog: {
    isOpen: false,
    modelUrl: null,
  },
  score: null,
  comparisonResults: createComparisonResults(),

  setActiveWorkspace: (workspaceKey) => {
    const { mode } = get()
    if (mode === 'single') {
      set({ activeWorkspaceKey: WORKSPACE_KEYS.SINGLE })
      return
    }
    if (workspaceKey === WORKSPACE_KEYS.LEFT || workspaceKey === WORKSPACE_KEYS.RIGHT) {
      set({ activeWorkspaceKey: workspaceKey })
    }
  },

  enterComparativeMode: () => set((state) => {
    const sourceWorkspace = cloneWorkspaceState(state.workspaces.single)
    return {
      mode: 'comparative',
      activeWorkspaceKey: WORKSPACE_KEYS.LEFT,
      workspaces: {
        ...state.workspaces,
        left: cloneWorkspaceState(sourceWorkspace),
        right: cloneWorkspaceState(sourceWorkspace),
      },
      comparisonResults: createComparisonResults(),
      modelDialog: { isOpen: false, modelUrl: null },
    }
  }),

  exitComparativeMode: () => set((state) => {
    const sourceKey = state.activeWorkspaceKey === WORKSPACE_KEYS.RIGHT ? WORKSPACE_KEYS.RIGHT : WORKSPACE_KEYS.LEFT
    return {
      mode: 'single',
      activeWorkspaceKey: WORKSPACE_KEYS.SINGLE,
      workspaces: {
        single: cloneWorkspaceState(state.workspaces[sourceKey]),
        left: createWorkspaceState(),
        right: createWorkspaceState(),
      },
      comparisonResults: createComparisonResults(),
      weightsSessionId: null,
      weightsIdMaps: null,
      awaitingWeightsConfirmation: false,
      masterPromptSessionId: null,
      awaitingMasterPromptConfirmation: false,
      masterPromptData: null,
      masterPromptLoadingByPane: {
        single: false,
        left: false,
        right: false,
      },
      progress: { current: 0, total: 0, stage: '' },
    }
  }),

  setReactFlowInstance: (instance, workspaceKey = null) => set((state) => (
    updateWorkspaceState(state, workspaceKey, { reactFlowInstance: instance })
  )),

  setNodes: (nodes, workspaceKey = null) => set((state) => (
    updateWorkspaceState(state, workspaceKey, {
      nodes: applyLayerOrder(nodes, state.isGenerating),
    })
  )),

  updateNodeData: (nodeId, newData, workspaceKey = null) => set((state) => {
    const key = resolveWorkspaceKey(state, workspaceKey)
    const workspace = state.workspaces[key]
    return updateWorkspaceState(state, key, {
      nodes: workspace.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...newData } }
          : node
      ),
    })
  }),

  updateNodeWeight: (nodeId, nextWeight, workspaceKey = null) => {
    const w = Math.max(0, Math.min(100, Math.round(Number(nextWeight) || 0)))
    get().updateNodeData(nodeId, { weight: w }, workspaceKey)
  },

  setNodeDimensions: (nodeId, dimensions, workspaceKey = null) => {
    const key = resolveWorkspaceKey(get(), workspaceKey)
    set((state) => {
      const workspace = state.workspaces[key]
      return updateWorkspaceState(state, key, {
        nodes: workspace.nodes.map((node) =>
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
      })
    })

    const instance = get().workspaces[key]?.reactFlowInstance
    if (instance?.updateNodeInternals) {
      requestAnimationFrame(() => instance.updateNodeInternals(nodeId))
    }
  },

  onNodesChange: (changes, workspaceKey = null) => set((state) => {
    const key = resolveWorkspaceKey(state, workspaceKey)
    const workspace = state.workspaces[key]
    const updatedNodes = [...workspace.nodes]
    changes.forEach((change) => {
      const nodeIndex = updatedNodes.findIndex((n) => n.id === change.id)
      if (nodeIndex === -1) return

      if (change.type === 'position' && change.position) {
        updatedNodes[nodeIndex] = { ...updatedNodes[nodeIndex], position: change.position }
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
    })

    return updateWorkspaceState(state, key, {
      nodes: applyLayerOrder(updatedNodes, state.isGenerating),
    })
  }),

  bringNodeForward: (nodeId, workspaceKey = null) => set((state) => {
    const key = resolveWorkspaceKey(state, workspaceKey)
    const workspace = state.workspaces[key]
    const index = workspace.nodes.findIndex((node) => node.id === nodeId)
    if (index === -1 || workspace.nodes[index]?.type === 'clusterNode' || index === workspace.nodes.length - 1) {
      return {}
    }

    const reordered = [...workspace.nodes]
    const [node] = reordered.splice(index, 1)
    reordered.splice(index + 1, 0, node)
    return updateWorkspaceState(state, key, {
      nodes: applyLayerOrder(reordered, state.isGenerating),
    })
  }),

  sendNodeBackward: (nodeId, workspaceKey = null) => set((state) => {
    const key = resolveWorkspaceKey(state, workspaceKey)
    const workspace = state.workspaces[key]
    const index = workspace.nodes.findIndex((node) => node.id === nodeId)
    if (index <= 0 || workspace.nodes[index]?.type === 'clusterNode') {
      return {}
    }

    const reordered = [...workspace.nodes]
    const [node] = reordered.splice(index, 1)
    reordered.splice(index - 1, 0, node)
    return updateWorkspaceState(state, key, {
      nodes: applyLayerOrder(reordered, state.isGenerating),
    })
  }),

  getCenterPosition: (workspaceKey = null) => {
    const workspace = getWorkspace(get(), workspaceKey)
    const instance = workspace.reactFlowInstance
    if (!instance?.getViewport) {
      return { x: 120, y: 120 }
    }

    const { x, y, zoom } = instance.getViewport()
    return {
      x: (window.innerWidth / 2 - x) / zoom,
      y: ((window.innerHeight - DEFAULT_SIZES.TOPBAR_HEIGHT) / 2 - y) / zoom,
    }
  },

  addImage: (src, workspaceKey = null) => {
    const key = resolveWorkspaceKey(get(), workspaceKey)
    const position = get().getCenterPosition(key)
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

      set((state) => {
        const workspace = state.workspaces[key]
        return updateWorkspaceState(state, key, {
          nodes: applyLayerOrder([...workspace.nodes, newNode], state.isGenerating),
        })
      })
    }

    image.onload = () => {
      const naturalWidth = image.naturalWidth || DEFAULT_SIZES.IMAGE.width
      const naturalHeight = image.naturalHeight || DEFAULT_SIZES.IMAGE.height
      const scale = Math.max(naturalWidth, naturalHeight) > DEFAULT_SIZES.IMAGE.maxDimension
        ? DEFAULT_SIZES.IMAGE.maxDimension / Math.max(naturalWidth, naturalHeight)
        : 1
      appendNode(naturalWidth * scale, naturalHeight * scale, naturalWidth / naturalHeight)
    }

    image.onerror = () => {
      appendNode(DEFAULT_SIZES.IMAGE.width, DEFAULT_SIZES.IMAGE.height, DEFAULT_SIZES.IMAGE.fallbackAspectRatio)
    }

    image.src = src
  },

  addVideo: (src, workspaceKey = null) => {
    const key = resolveWorkspaceKey(get(), workspaceKey)
    const position = get().getCenterPosition(key)
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

      set((state) => {
        const workspace = state.workspaces[key]
        return updateWorkspaceState(state, key, {
          nodes: applyLayerOrder([...workspace.nodes, newNode], state.isGenerating),
        })
      })
    }

    const handleLoadedMetadata = () => {
      const naturalWidth = video.videoWidth || DEFAULT_SIZES.VIDEO.width
      const naturalHeight = video.videoHeight || DEFAULT_SIZES.VIDEO.height
      const scale = Math.max(naturalWidth, naturalHeight) > DEFAULT_SIZES.VIDEO.maxDimension
        ? DEFAULT_SIZES.VIDEO.maxDimension / Math.max(naturalWidth, naturalHeight)
        : 1
      appendNode(naturalWidth * scale, naturalHeight * scale, naturalWidth / naturalHeight)
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

  addText: (workspaceKey = null) => {
    const key = resolveWorkspaceKey(get(), workspaceKey)
    const position = get().getCenterPosition(key)
    const width = DEFAULT_SIZES.TEXT.width
    const height = DEFAULT_SIZES.TEXT.height
    const newNode = {
      id: `text-${Date.now()}`,
      type: 'textNode',
      position,
      data: addInitialSize({ text: 'Double-click to edit', fontSize: DEFAULT_FONT_SIZE }, width, height),
      style: { width, height },
    }
    set((state) => {
      const workspace = state.workspaces[key]
      return updateWorkspaceState(state, key, {
        nodes: applyLayerOrder([...workspace.nodes, newNode], state.isGenerating),
      })
    })
  },

  addFont: (fontData, fontName, workspaceKey = null) => {
    const key = resolveWorkspaceKey(get(), workspaceKey)
    const position = get().getCenterPosition(key)
    const nodeId = `font-${Date.now()}`
    const uniqueFontFamily = `CustomFont-${nodeId}`

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
        uniqueFontFamily,
        fontData,
      }, width, height),
      style: { width, height },
    }

    set((state) => {
      const workspace = state.workspaces[key]
      return updateWorkspaceState(state, key, {
        nodes: applyLayerOrder([...workspace.nodes, newNode], state.isGenerating),
      })
    })
  },

  addModel: (src, fileName, workspaceKey = null) => {
    const key = resolveWorkspaceKey(get(), workspaceKey)
    const position = get().getCenterPosition(key)
    const width = DEFAULT_SIZES.MODEL.width
    const height = DEFAULT_SIZES.MODEL.height
    const newNode = {
      id: `model-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'modelNode',
      position,
      data: addInitialSize({
        src,
        fileName: fileName || 'model.glb',
      }, width, height),
      dragHandle: '.react-flow-drag-handle',
      style: { width, height },
    }

    set((state) => {
      const workspace = state.workspaces[key]
      return updateWorkspaceState(state, key, {
        nodes: applyLayerOrder([...workspace.nodes, newNode], state.isGenerating),
      })
    })
  },

  addPalette: (colors, options = {}, workspaceKey = null) => {
    const key = resolveWorkspaceKey(get(), workspaceKey)
    const position = get().getCenterPosition(key)
    const width = Number.isFinite(options.width) ? options.width : DEFAULT_SIZES.PALETTE.width
    const height = Number.isFinite(options.height) ? options.height : DEFAULT_SIZES.PALETTE.height
    const nodeId = `palette-${Date.now()}`

    const newNode = {
      id: nodeId,
      type: 'paletteNode',
      position,
      data: addInitialSize({
        colors: Array.isArray(colors) ? [...colors] : [],
        origin: options.origin || 'manual',
      }, width, height),
      style: { width, height },
    }

    set((state) => {
      const workspace = state.workspaces[key]
      return updateWorkspaceState(state, key, {
        nodes: applyLayerOrder([...workspace.nodes, newNode], state.isGenerating),
      })
    })
  },

  addCluster: (title, workspaceKey = null) => {
    const key = resolveWorkspaceKey(get(), workspaceKey)
    const position = get().getCenterPosition(key)
    const clusterTitle = typeof title === 'string' && title.trim().length > 0 ? title.trim() : 'Cluster'
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

    set((state) => {
      const workspace = state.workspaces[key]
      return updateWorkspaceState(state, key, {
        nodes: applyLayerOrder([...workspace.nodes, newNode], state.isGenerating),
      })
    })
  },

  fitView: (workspaceKey = null) => set((state) => {
    const key = resolveWorkspaceKey(state, workspaceKey)
    const workspace = state.workspaces[key]
    return updateWorkspaceState(state, key, { fitViewTrigger: workspace.fitViewTrigger + 1 })
  }),

  clearWeights: (workspaceKeys = null) => set((state) => {
    const keys = workspaceKeys || (state.mode === 'comparative'
      ? [WORKSPACE_KEYS.LEFT, WORKSPACE_KEYS.RIGHT]
      : [WORKSPACE_KEYS.SINGLE])

    const nextWorkspaces = { ...state.workspaces }
    keys.forEach((key) => {
      const workspace = state.workspaces[key]
      nextWorkspaces[key] = {
        ...workspace,
        nodes: workspace.nodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            weight: undefined,
          },
        })),
      }
    })

    return { workspaces: nextWorkspaces }
  }),

  clearAll: () => {
    if (!confirm('Are you sure you want to clear all elements in the active workspace?')) return
    const key = resolveWorkspaceKey(get())
    set((state) => updateWorkspaceState(state, key, { nodes: [], edges: [] }))
  },

  applyWeightsToWorkspace: (weightsData, idMaps, workspaceKey = null) => set((state) => {
    const key = resolveWorkspaceKey(state, workspaceKey)
    const workspace = state.workspaces[key]
    return updateWorkspaceState(state, key, {
      nodes: workspace.nodes.map((node) => {
        const map = node.type === 'clusterNode' ? idMaps?.clusters : idMaps?.elements
        const source = node.type === 'clusterNode' ? weightsData?.cluster_weights : weightsData?.weights
        if (!(map instanceof Map)) return node

        for (const [backendId, frontendId] of map.entries()) {
          if (frontendId === node.id && source?.[backendId] != null) {
            return { ...node, data: { ...node.data, weight: source[backendId] } }
          }
        }

        return node
      }),
    })
  }),

  generateMoodboard: async (prompt = '') => {
    if (get().mode === 'comparative') {
      return get().generateComparativeMoodboard(prompt)
    }
    return get().generateSingleMoodboard(prompt)
  },

  generateSingleMoodboard: async (prompt = '') => {
    const workspace = get().workspaces.single
    const { payload, idMaps } = serializeDataForBackend(workspace.nodes)

    if ((!payload.elements || payload.elements.length === 0) && (!payload.clusters || payload.clusters.length === 0)) {
      return { weights: {}, cluster_weights: {} }
    }

    payload.prompt = prompt

    set({
      isGenerating: true,
      generationMode: 'single',
      awaitingWeightsConfirmation: false,
      weightsSessionId: null,
      weightsIdMaps: null,
      awaitingMasterPromptConfirmation: false,
      masterPromptSessionId: null,
      masterPromptData: null,
      masterPromptLoadingByPane: { single: false, left: false, right: false },
      progress: { current: 0, total: 0, stage: 'Starting...' },
      score: null,
      modelDialog: { isOpen: false, modelUrl: null },
    })

    try {
      const response = await fetch(`${BACKEND_URL}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) throw new Error('Backend generation failed')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalResult = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''

        for (const event of events) {
          if (!event.trim()) continue
          const dataMatch = event.match(/^data:\s*(.+)$/m)
          if (!dataMatch) continue

          try {
            const parsed = JSON.parse(dataMatch[1])
            const { type, data, session_id } = parsed

            if (type === 'progress') {
              set({ progress: data })
            } else if (type === 'weights') {
              get().applyWeightsToWorkspace(data, idMaps, WORKSPACE_KEYS.SINGLE)
              if (session_id) {
                set({
                  weightsSessionId: session_id,
                  weightsIdMaps: idMaps,
                  awaitingWeightsConfirmation: true,
                  progress: { current: 0, total: 0, stage: '' },
                })
              }
            } else if (type === 'master_prompt') {
              if (session_id) {
                set({
                  masterPromptSessionId: session_id,
                  awaitingMasterPromptConfirmation: true,
                  masterPromptData: {
                    mode: 'single',
                    prompt: data.prompt,
                    image: data.image,
                    referenceImages: data.reference_images || [],
                  },
                  masterPromptLoadingByPane: { single: false, left: false, right: false },
                  progress: { current: 0, total: 0, stage: '' },
                })
              }
            } else if (type === 'complete') {
              finalResult = data
              set({
                awaitingWeightsConfirmation: false,
                weightsSessionId: null,
                weightsIdMaps: null,
                awaitingMasterPromptConfirmation: false,
                masterPromptSessionId: null,
                masterPromptData: null,
                masterPromptLoadingByPane: { single: false, left: false, right: false },
                progress: { current: 0, total: 0, stage: '' },
              })
              if (data.file) {
                const url = data.file.startsWith('http') ? data.file : `${BACKEND_URL}${data.file}`
                get().openModelDialog(url)
              }
            } else if (type === 'score') {
              set({ score: data.score })
            } else if (type === 'cancelled') {
              set({
                awaitingWeightsConfirmation: false,
                weightsSessionId: null,
                weightsIdMaps: null,
                awaitingMasterPromptConfirmation: false,
                masterPromptSessionId: null,
                masterPromptData: null,
                masterPromptLoadingByPane: { single: false, left: false, right: false },
              })
              return { cancelled: true }
            } else if (type === 'error') {
              throw new Error(data)
            }
          } catch (error) {
            console.error('Error parsing SSE data:', error)
          }
        }
      }

      return finalResult || {}
    } finally {
      set({
        isGenerating: false,
        generationMode: 'single',
        awaitingWeightsConfirmation: false,
        weightsSessionId: null,
        weightsIdMaps: null,
        awaitingMasterPromptConfirmation: false,
        masterPromptSessionId: null,
        masterPromptData: null,
        masterPromptLoadingByPane: { single: false, left: false, right: false },
        progress: { current: 0, total: 0, stage: '' },
      })
    }
  },

  generateComparativeMoodboard: async (prompt = '') => {
    const left = serializeDataForBackend(get().workspaces.left.nodes)
    const right = serializeDataForBackend(get().workspaces.right.nodes)
    const leftPayload = left.payload
    const rightPayload = right.payload

    if (
      ((!leftPayload.elements || leftPayload.elements.length === 0) && (!leftPayload.clusters || leftPayload.clusters.length === 0)) ||
      ((!rightPayload.elements || rightPayload.elements.length === 0) && (!rightPayload.clusters || rightPayload.clusters.length === 0))
    ) {
      return { cancelled: true }
    }

    set({
      isGenerating: true,
      generationMode: 'comparative',
      awaitingWeightsConfirmation: false,
      weightsSessionId: null,
      weightsIdMaps: null,
      awaitingMasterPromptConfirmation: false,
      masterPromptSessionId: null,
      masterPromptData: null,
      masterPromptLoadingByPane: { single: false, left: false, right: false },
      progress: { current: 0, total: 0, stage: 'Starting comparative generation...' },
      score: null,
      comparisonResults: {
        left: { status: 'preparing', message: 'Preparing left workspace', modelUrl: null, score: null },
        right: { status: 'preparing', message: 'Preparing right workspace', modelUrl: null, score: null },
      },
      modelDialog: { isOpen: false, modelUrl: null },
    })

    try {
      const response = await fetch(`${BACKEND_URL}/extract/comparative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          left: { ...leftPayload, prompt },
          right: { ...rightPayload, prompt },
          prompt,
        }),
      })

      if (!response.ok) throw new Error('Comparative generation failed')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''

        for (const event of events) {
          if (!event.trim()) continue
          const dataMatch = event.match(/^data:\s*(.+)$/m)
          if (!dataMatch) continue

          try {
            const parsed = JSON.parse(dataMatch[1])
            const { type, data, session_id } = parsed

            if (type === 'progress') {
              set({ progress: data })
            } else if (type === 'pane_status') {
              set((state) => ({
                comparisonResults: updateComparisonResult(state.comparisonResults, data.pane, {
                  status: data.status,
                  message: data.message,
                }),
              }))
            } else if (type === 'weights') {
              get().applyWeightsToWorkspace(data.panes.left, left.idMaps, WORKSPACE_KEYS.LEFT)
              get().applyWeightsToWorkspace(data.panes.right, right.idMaps, WORKSPACE_KEYS.RIGHT)
              set((state) => ({
                weightsSessionId: session_id,
                weightsIdMaps: {
                  left: left.idMaps,
                  right: right.idMaps,
                },
                awaitingWeightsConfirmation: true,
                progress: { current: 0, total: 0, stage: '' },
                comparisonResults: updateComparisonResult(
                  updateComparisonResult(state.comparisonResults, WORKSPACE_KEYS.LEFT, {
                    status: 'review',
                    message: 'Review weights',
                  }),
                  WORKSPACE_KEYS.RIGHT,
                  {
                    status: 'review',
                    message: 'Review weights',
                  }
                ),
              }))
            } else if (type === 'master_prompt') {
              set((state) => ({
                masterPromptSessionId: session_id,
                awaitingMasterPromptConfirmation: true,
                masterPromptData: {
                  mode: 'comparative',
                  panes: data.panes,
                },
                masterPromptLoadingByPane: { single: false, left: false, right: false },
                progress: { current: 0, total: 0, stage: '' },
                comparisonResults: updateComparisonResult(
                  updateComparisonResult(state.comparisonResults, WORKSPACE_KEYS.LEFT, {
                    status: 'review',
                    message: 'Review master prompt',
                  }),
                  WORKSPACE_KEYS.RIGHT,
                  {
                    status: 'review',
                    message: 'Review master prompt',
                  }
                ),
              }))
            } else if (type === 'trellis_status') {
              set((state) => ({
                comparisonResults: updateComparisonResult(state.comparisonResults, data.pane, {
                  status: data.status,
                  message: data.message,
                }),
              }))
            } else if (type === 'pane_complete') {
              const url = data.file.startsWith('http') ? data.file : `${BACKEND_URL}${data.file}`
              get().addModel(url, `${data.pane}-comparison.glb`, data.pane)
              set((state) => ({
                comparisonResults: updateComparisonResult(state.comparisonResults, data.pane, {
                  status: 'completed',
                  message: '3D model ready',
                  modelUrl: url,
                  score: data.score ?? null,
                }),
              }))
            } else if (type === 'comparison_complete') {
              set({ progress: { current: 0, total: 0, stage: '' } })
            } else if (type === 'cancelled') {
              set((state) => ({
                comparisonResults: updateComparisonResult(
                  updateComparisonResult(state.comparisonResults, WORKSPACE_KEYS.LEFT, {
                    status: 'cancelled',
                    message: 'Cancelled',
                  }),
                  WORKSPACE_KEYS.RIGHT,
                  {
                    status: 'cancelled',
                    message: 'Cancelled',
                  }
                ),
              }))
              return { cancelled: true }
            } else if (type === 'error') {
              throw new Error(data)
            }
          } catch (error) {
            console.error('Error parsing comparative SSE data:', error)
          }
        }
      }

      return { ok: true }
    } finally {
      set({
        isGenerating: false,
        awaitingWeightsConfirmation: false,
        weightsSessionId: null,
        weightsIdMaps: null,
        awaitingMasterPromptConfirmation: false,
        masterPromptSessionId: null,
        masterPromptData: null,
        masterPromptLoadingByPane: { single: false, left: false, right: false },
        progress: { current: 0, total: 0, stage: '' },
      })
    }
  },

  confirmWeights: async () => {
    const { weightsSessionId, weightsIdMaps, workspaces, mode } = get()
    if (!weightsSessionId) return

    set({ awaitingWeightsConfirmation: false, weightsSessionId: null, weightsIdMaps: null })

    try {
      if (mode === 'comparative' && weightsIdMaps?.left && weightsIdMaps?.right) {
        await fetch(`${BACKEND_URL}/comparisons/${weightsSessionId}/confirm-weights`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            confirmed: true,
            panes: {
              left: buildEditedWeightsPayload(workspaces.left.nodes, weightsIdMaps.left),
              right: buildEditedWeightsPayload(workspaces.right.nodes, weightsIdMaps.right),
            },
          }),
        })
        get().clearWeights([WORKSPACE_KEYS.LEFT, WORKSPACE_KEYS.RIGHT])
        return
      }

      await fetch(`${BACKEND_URL}/confirm-weights/${weightsSessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmed: true,
          ...buildEditedWeightsPayload(workspaces.single.nodes, weightsIdMaps),
        }),
      })
      get().clearWeights([WORKSPACE_KEYS.SINGLE])
    } catch (error) {
      console.error('Error confirming weights:', error)
    }
  },

  cancelWeights: async () => {
    const { weightsSessionId, mode } = get()
    if (!weightsSessionId) return

    try {
      if (mode === 'comparative') {
        await fetch(`${BACKEND_URL}/comparisons/${weightsSessionId}/confirm-weights`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmed: false, panes: {} }),
        })
        get().clearWeights([WORKSPACE_KEYS.LEFT, WORKSPACE_KEYS.RIGHT])
      } else {
        await fetch(`${BACKEND_URL}/confirm-weights/${weightsSessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmed: false }),
        })
        get().clearWeights([WORKSPACE_KEYS.SINGLE])
      }
      set({ weightsIdMaps: null })
    } catch (error) {
      console.error('Error cancelling weights:', error)
    }
  },

  confirmMasterPrompt: async () => {
    const { masterPromptSessionId, masterPromptData } = get()
    if (!masterPromptSessionId) return

    try {
      if (masterPromptData?.mode === 'comparative') {
        await fetch(`${BACKEND_URL}/comparisons/${masterPromptSessionId}/confirm-master-prompts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmed: true }),
        })
      } else {
        await fetch(`${BACKEND_URL}/confirm-weights/${masterPromptSessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmed: true }),
        })
      }

      set({
        awaitingMasterPromptConfirmation: false,
        masterPromptSessionId: null,
        masterPromptData: null,
        masterPromptLoadingByPane: { single: false, left: false, right: false },
      })
    } catch (error) {
      console.error('Error confirming master prompt:', error)
    }
  },

  cancelMasterPrompt: async () => {
    const { masterPromptSessionId, masterPromptData } = get()
    if (!masterPromptSessionId) return

    try {
      if (masterPromptData?.mode === 'comparative') {
        await fetch(`${BACKEND_URL}/comparisons/${masterPromptSessionId}/confirm-master-prompts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmed: false }),
        })
      } else {
        await fetch(`${BACKEND_URL}/confirm-weights/${masterPromptSessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmed: false }),
        })
      }

      set({
        awaitingMasterPromptConfirmation: false,
        masterPromptSessionId: null,
        masterPromptData: null,
        masterPromptLoadingByPane: { single: false, left: false, right: false },
      })
    } catch (error) {
      console.error('Error cancelling master prompt:', error)
    }
  },

  regenerateMasterPromptImage: async (...args) => {
    const { masterPromptSessionId, masterPromptData } = get()
    if (!masterPromptSessionId || !masterPromptData) return

    if (masterPromptData.mode === 'comparative') {
      const [pane, prompt] = args
      const nextPrompt = (prompt || '').trim()
      if (!pane || !nextPrompt) return

      set((state) => ({
        masterPromptLoadingByPane: {
          ...state.masterPromptLoadingByPane,
          [pane]: true,
        },
      }))

      try {
        const response = await fetch(`${BACKEND_URL}/comparisons/${masterPromptSessionId}/panes/${pane}/master-prompt/regenerate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: nextPrompt }),
        })
        if (!response.ok) throw new Error(`Failed to regenerate comparative master image (${response.status})`)

        const data = await response.json()
        set((state) => ({
          masterPromptData: state.masterPromptData?.mode === 'comparative'
            ? {
                ...state.masterPromptData,
                panes: {
                  ...state.masterPromptData.panes,
                  [pane]: {
                    ...state.masterPromptData.panes[pane],
                    prompt: nextPrompt,
                    image: data.image || state.masterPromptData.panes[pane].image,
                  },
                },
              }
            : state.masterPromptData,
        }))
      } catch (error) {
        console.error('Error regenerating comparative master prompt image:', error)
      } finally {
        set((state) => ({
          masterPromptLoadingByPane: {
            ...state.masterPromptLoadingByPane,
            [pane]: false,
          },
        }))
      }
      return
    }

    const [prompt] = args
    const nextPrompt = (prompt || '').trim()
    if (!nextPrompt) return

    set((state) => ({
      masterPromptLoadingByPane: {
        ...state.masterPromptLoadingByPane,
        single: true,
      },
    }))

    try {
      const response = await fetch(`${BACKEND_URL}/master-prompt/${masterPromptSessionId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: nextPrompt }),
      })
      if (!response.ok) throw new Error(`Failed to regenerate master image (${response.status})`)

      const data = await response.json()
      set((state) => ({
        masterPromptData: state.masterPromptData?.mode === 'single'
          ? {
              ...state.masterPromptData,
              prompt: nextPrompt,
              image: data.image || state.masterPromptData.image,
            }
          : state.masterPromptData,
      }))
    } catch (error) {
      console.error('Error regenerating master prompt image:', error)
    } finally {
      set((state) => ({
        masterPromptLoadingByPane: {
          ...state.masterPromptLoadingByPane,
          single: false,
        },
      }))
    }
  },

  editMasterPromptImage: async (...args) => {
    const { masterPromptSessionId, masterPromptData } = get()
    if (!masterPromptSessionId || !masterPromptData) return

    if (masterPromptData.mode === 'comparative') {
      const [pane, editPrompt] = args
      const nextEditPrompt = (editPrompt || '').trim()
      const paneData = masterPromptData.panes?.[pane]
      if (!pane || !paneData?.image || !nextEditPrompt) return

      set((state) => ({
        masterPromptLoadingByPane: {
          ...state.masterPromptLoadingByPane,
          [pane]: true,
        },
      }))

      try {
        const response = await fetch(`${BACKEND_URL}/comparisons/${masterPromptSessionId}/panes/${pane}/master-prompt/edit-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: nextEditPrompt,
            image: paneData.image,
          }),
        })
        if (!response.ok) throw new Error(`Failed to edit comparative master image (${response.status})`)

        const data = await response.json()
        set((state) => ({
          masterPromptData: state.masterPromptData?.mode === 'comparative'
            ? {
                ...state.masterPromptData,
                panes: {
                  ...state.masterPromptData.panes,
                  [pane]: {
                    ...state.masterPromptData.panes[pane],
                    image: data.image || state.masterPromptData.panes[pane].image,
                  },
                },
              }
            : state.masterPromptData,
        }))
      } catch (error) {
        console.error('Error editing comparative master prompt image:', error)
      } finally {
        set((state) => ({
          masterPromptLoadingByPane: {
            ...state.masterPromptLoadingByPane,
            [pane]: false,
          },
        }))
      }
      return
    }

    const [editPrompt] = args
    const nextEditPrompt = (editPrompt || '').trim()
    if (!masterPromptData?.image || !nextEditPrompt) return

    set((state) => ({
      masterPromptLoadingByPane: {
        ...state.masterPromptLoadingByPane,
        single: true,
      },
    }))

    try {
      const response = await fetch(`${BACKEND_URL}/master-prompt/${masterPromptSessionId}/edit-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: nextEditPrompt,
          image: masterPromptData.image,
        }),
      })
      if (!response.ok) throw new Error(`Failed to edit master image (${response.status})`)

      const data = await response.json()
      set((state) => ({
        masterPromptData: state.masterPromptData?.mode === 'single'
          ? { ...state.masterPromptData, image: data.image || state.masterPromptData.image }
          : state.masterPromptData,
      }))
    } catch (error) {
      console.error('Error editing master prompt image:', error)
    } finally {
      set((state) => ({
        masterPromptLoadingByPane: {
          ...state.masterPromptLoadingByPane,
          single: false,
        },
      }))
    }
  },

  openModelDialog: (url) => set({ modelDialog: { isOpen: true, modelUrl: url } }),
  closeModelDialog: () => set({ modelDialog: { isOpen: false, modelUrl: null } }),

  saveMoodboard: () => {
    const key = resolveWorkspaceKey(get())
    const workspace = get().workspaces[key]
    const moodboardData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      nodes: workspace.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data,
        style: node.style,
      })),
    }

    const dataBlob = new Blob([JSON.stringify(moodboardData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `moodboard-${key}-${Date.now()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  },

  loadMoodboard: (data) => {
    const key = resolveWorkspaceKey(get())
    try {
      if (!data.nodes || !Array.isArray(data.nodes)) return

      set((state) => updateWorkspaceState(state, key, {
        nodes: applyLayerOrder(data.nodes, state.isGenerating),
        edges: [],
      }))

      setTimeout(() => {
        set((state) => {
          const workspace = state.workspaces[key]
          return updateWorkspaceState(state, key, { fitViewTrigger: workspace.fitViewTrigger + 1 })
        })
      }, 100)
    } catch (error) {
      console.error('Error loading moodboard:', error)
      alert('Error loading moodboard')
    }
  },

  getWorkspaceData: (workspaceKey = null) => getWorkspace(get(), workspaceKey),
  isMasterPromptLoading: () => anyMasterPromptLoading(get().masterPromptLoadingByPane),
}))

export { WORKSPACE_KEYS }
