import React from 'react'
import { NodeResizer } from 'reactflow'
import './ImageNode.css'

/**
 * ImageNode Component
 * Displays an image with resizable handles that maintain aspect ratio
 */
function ImageNode({ data, selected }) {
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
      <div className="image-node">
        <img
          src={data.src}
          alt="Moodboard image"
          draggable={false}
        />
      </div>
    </>
  )
}

export default ImageNode
