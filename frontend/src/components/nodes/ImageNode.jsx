import React from 'react'
import { NodeResizer } from 'reactflow'
import { useMoodboardStore } from '../../store/moodboardStore'
import NodeLayerControls from './NodeLayerControls'
import WeightOverlay from './WeightOverlay'
import './ImageNode.css'

/**
 * ImageNode Component
 * Displays an image with resizable handles that maintain aspect ratio
 */
function ImageNode({ id, data, selected }) {
  const isGenerating = useMoodboardStore((s) => s.isGenerating)

  return (
    <>
      <NodeResizer
        isVisible={selected && !isGenerating}
        minWidth={50}
        minHeight={50}
        keepAspectRatio={true}
        lineClassName="node-resizer-line"
        handleClassName="node-resizer-handle"
      />
      <div className="node-frame">
        <NodeLayerControls id={id} isVisible={selected && !isGenerating} />
        <div className="image-node">
          <img
            src={data.src}
            alt="Moodboard image"
            draggable={false}
          />
          <WeightOverlay nodeId={id} weight={data.weight} />
        </div>
      </div>
    </>
  )
}

export default ImageNode
