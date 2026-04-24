import React, { useCallback, useMemo } from 'react'
import ReactFlow, { Background, ReactFlowProvider, useReactFlow } from 'reactflow'
import 'reactflow/dist/style.css'
import TextNode from '../components/nodes/TextNode'
import ModelNode from '../components/nodes/ModelNode'
import ColorPaletteNode from '../components/nodes/ColorPaletteNode'
import '../components/nodes/ClusterNode.css'

// Lightweight cluster node — no store dependency
function ClusterNodePreview({ data }) {
  return (
    <div className="cluster-node" style={{ pointerEvents: 'none', width: '100%', height: '100%' }}>
      <div className="cluster-node-header" style={{ cursor: 'default' }}>
        <span className="cluster-title">{data.title || 'Cluster'}</span>
      </div>
      <div className="cluster-node-body" />
    </div>
  )
}

// Image preview: object-fit contain so portrait/square images are never cropped
function ImageNodePreview({ data }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#f0f0f0',
      borderRadius: 6,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <img
        src={data.src}
        alt=""
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
      />
    </div>
  )
}

// Video preview: contain so portrait videos aren't cropped either
function VideoNodePreview({ data }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#000',
      borderRadius: 6,
      overflow: 'hidden',
    }}>
      <video
        src={data.src}
        controls
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
      />
    </div>
  )
}

const nodeTypes = {
  clusterNode: ClusterNodePreview,
  imageNode:   ImageNodePreview,
  videoNode:   VideoNodePreview,
  textNode:    TextNode,
  modelNode:   ModelNode,
  paletteNode: ColorPaletteNode,
}

const DEFAULT_SIZES = {
  image:   { width: 300, height: 200 },
  video:   { width: 400, height: 225 },
  model:   { width: 300, height: 300 },
  text:    { width: 200, height: 40  },
  palette: { width: 150, height: 100 },
}

function elementToNode(elem, baseUrl, backendUrl) {
  const def = DEFAULT_SIZES[elem.type] || { width: 200, height: 200 }

  // Prefer stored pixel dimensions (new datasets); fall back to ratio × default
  const width  = elem.pixelSize ? elem.pixelSize.width
                : Math.round(elem.size.x * def.width)
  const height = elem.pixelSize ? elem.pixelSize.height
                : Math.round(elem.size.y * def.height)

  const assetUrl = elem.path ? `${backendUrl}${baseUrl}/moodboard/${elem.path}` : undefined

  return {
    id: `node-${elem.id}`,
    type: `${elem.type}Node`,
    position: elem.position,
    draggable: false,
    selectable: false,
    data: {
      src: assetUrl,
      fileName: elem.fileName || (elem.path ? elem.path.split('/').pop() : undefined),
      text: elem.text,
      colors: elem.colors,
      aspectRatio: width / height,
      initialSize: { width: def.width, height: def.height },
      weight: null,
    },
    style: { width, height },
  }
}

const CLUSTER_PADDING = 80

function clusterToNode(cluster, contentNodes) {
  // If the cluster has stored position + size, use them directly
  if (cluster.position && cluster.pixelSize) {
    return {
      id: `cluster-${cluster.id}`,
      type: 'clusterNode',
      position: cluster.position,
      draggable: false,
      selectable: false,
      data: { title: cluster.title },
      style: { width: cluster.pixelSize.width, height: cluster.pixelSize.height },
    }
  }

  // Legacy fallback: compute bounding box from member element nodes
  const members = contentNodes.filter(n =>
    cluster.elements.includes(parseInt(n.id.replace('node-', ''), 10))
  )
  if (!members.length) return null

  const minX = Math.min(...members.map(n => n.position.x))
  const maxX = Math.max(...members.map(n => n.position.x + (n.style?.width  || 0)))
  const minY = Math.min(...members.map(n => n.position.y))
  const maxY = Math.max(...members.map(n => n.position.y + (n.style?.height || 0)))

  return {
    id: `cluster-${cluster.id}`,
    type: 'clusterNode',
    position: { x: minX - CLUSTER_PADDING, y: minY - CLUSTER_PADDING },
    draggable: false,
    selectable: false,
    data: { title: cluster.title },
    style: {
      width:  maxX - minX + CLUSTER_PADDING * 2,
      height: maxY - minY + CLUSTER_PADDING * 2,
    },
  }
}

function PreviewCanvas({ nodes }) {
  const { fitView } = useReactFlow()
  const handleFitView = useCallback(
    () => fitView({ padding: 0.2, duration: 300 }),
    [fitView]
  )

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        fitView
        proOptions={{ hideAttribution: true }}
        minZoom={0.05}
        maxZoom={4}
      >
        <Background color="var(--color-grid-lines)" gap={20} />
      </ReactFlow>
      <button onClick={handleFitView} style={fitBtn}>
        Fit View
      </button>
    </div>
  )
}

export default function MoodboardPreview({ elements, clusters = [], baseUrl, backendUrl }) {
  const nodes = useMemo(() => {
    const contentNodes = elements.map(e => elementToNode(e, baseUrl, backendUrl))
    const clusterNodes = clusters
      .map(c => clusterToNode(c, contentNodes))
      .filter(Boolean)
    // Clusters first so they render behind content nodes
    return [...clusterNodes, ...contentNodes]
  }, [elements, clusters, baseUrl, backendUrl])

  return (
    <ReactFlowProvider>
      <PreviewCanvas nodes={nodes} />
    </ReactFlowProvider>
  )
}

const fitBtn = {
  position: 'absolute',
  bottom: '12px',
  left: '12px',
  zIndex: 10,
  padding: '6px 14px',
  fontSize: '0.82rem',
  fontWeight: 500,
  background: 'var(--color-button-bg)',
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-button-border)',
  borderRadius: '6px',
  cursor: 'pointer',
}
