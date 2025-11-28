import React from 'react'
import { NodeResizer } from 'reactflow'
import NodeLayerControls from './NodeLayerControls'
import WeightOverlay from './WeightOverlay'
import './VideoNode.css'

/**
 * VideoNode Component
 * Displays a video with resizable handles that maintain aspect ratio
 */
function VideoNode({ id, data, selected }) {
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
      <div className="node-frame">
        <NodeLayerControls id={id} isVisible={selected} />
        <div className="video-node">
          <video
            src={data.src}
            controls
          />
          <WeightOverlay weight={data.weight} reasoning={data.reasoning} />
        </div>
      </div>
    </>
  )
}

export default VideoNode
