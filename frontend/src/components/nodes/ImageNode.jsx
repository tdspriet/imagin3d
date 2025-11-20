import React from 'react'
import { NodeResizer } from 'reactflow'
import NodeLayerControls from './NodeLayerControls'
import './ImageNode.css'

/**
 * ImageNode Component
 * Displays an image with resizable handles that maintain aspect ratio
 */
function ImageNode({ id, data, selected }) {
  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={50}
        minHeight={50}
        keepAspectRatio={true}
        lineClassName="node-resizer-line"
        handleClassName="node-resizer-handle"
      />
      <div className="node-frame">
        <NodeLayerControls id={id} isVisible={selected} />
        <div className="image-node">
          <img
            src={data.src}
            alt="Moodboard image"
            draggable={false}
          />
        </div>
      </div>
    </>
  )
}

export default ImageNode
