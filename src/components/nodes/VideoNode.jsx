import React from 'react'
import { NodeResizer } from 'reactflow'
import './VideoNode.css'

/**
 * VideoNode Component
 * Displays a video with resizable handles that maintain aspect ratio
 */
function VideoNode({ data, selected }) {
  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={100}
        minHeight={100}
        keepAspectRatio={true}
        lineClassName="node-resizer-line"
        handleClassName="node-resizer-handle"
      />
      <div className="video-node">
        <video
          src={data.src}
          controls
        />
      </div>
    </>
  )
}

export default VideoNode
