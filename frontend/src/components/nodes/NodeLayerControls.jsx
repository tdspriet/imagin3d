import React, { useCallback } from 'react'
import { MdFlipToFront, MdFlipToBack } from 'react-icons/md'
import { useMoodboardStore } from '../../store/moodboardStore'
import './NodeControls.css'

function NodeLayerControls({ id, isVisible }) {
  const bringNodeForward = useMoodboardStore((state) => state.bringNodeForward)
  const sendNodeBackward = useMoodboardStore((state) => state.sendNodeBackward)
  const isGenerating = useMoodboardStore((state) => state.isGenerating)

  const stopPropagation = useCallback((event) => {
    event.stopPropagation()
    event.preventDefault()
  }, [])

  const handleForward = useCallback(
    (event) => {
      stopPropagation(event)
      bringNodeForward(id)
    },
    [bringNodeForward, id, stopPropagation]
  )

  const handleBackward = useCallback(
    (event) => {
      stopPropagation(event)
      sendNodeBackward(id)
    },
    [sendNodeBackward, id, stopPropagation]
  )

  if (!isVisible || isGenerating) {
    return null
  }

  return (
    <div
      className="node-layer-controls"
      onPointerDown={stopPropagation}
      onMouseDown={stopPropagation}
      onDoubleClick={stopPropagation}
    >
      <button
        type="button"
        className="node-layer-btn"
        onClick={handleForward}
        aria-label="Move layer up"
      >
        <MdFlipToFront className="node-layer-icon" size={16} aria-hidden="true" focusable="false" />
      </button>
      <button
        type="button"
        className="node-layer-btn"
        onClick={handleBackward}
        aria-label="Move layer down"
      >
        <MdFlipToBack className="node-layer-icon" size={16} aria-hidden="true" focusable="false" />
      </button>
    </div>
  )
}

export default NodeLayerControls
