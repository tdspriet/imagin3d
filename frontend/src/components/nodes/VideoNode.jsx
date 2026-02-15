import React from 'react'
import { NodeResizer } from 'reactflow'
import { useMoodboardStore } from '../../store/moodboardStore'
import NodeLayerControls from './NodeLayerControls'
import WeightOverlay from './WeightOverlay'
import './VideoNode.css'

/**
 * VideoNode Component
 * Displays a video with resizable handles that maintain aspect ratio
 */
function VideoNode({ id, data, selected }) {
  const isGenerating = useMoodboardStore((s) => s.isGenerating)

  return (
    <>
      <NodeResizer
        isVisible={selected && !isGenerating}
        minWidth={100}
        minHeight={100}
        keepAspectRatio={true}
        lineClassName="node-resizer-line"
        handleClassName="node-resizer-handle"
      />
      <div className="node-frame">
        <NodeLayerControls id={id} isVisible={selected && !isGenerating} />
        <div className="video-node">
          <video
            src={data.src}
            controls
          />
          <WeightOverlay nodeId={id} weight={data.weight} />
        </div>
      </div>
    </>
  )
}

export default VideoNode
