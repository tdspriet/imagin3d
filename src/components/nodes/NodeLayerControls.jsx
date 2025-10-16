import React, { useCallback } from 'react'
import { useMoodboardStore } from '../../store/moodboardStore'
import './NodeControls.css'

function NodeLayerControls({ id, isVisible }) {
  const bringNodeForward = useMoodboardStore((state) => state.bringNodeForward)
  const sendNodeBackward = useMoodboardStore((state) => state.sendNodeBackward)

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

  if (!isVisible) {
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
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <polyline
            points="6 9.5 10 5.5 14 9.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
          <line
            x1="10"
            y1="6"
            x2="10"
            y2="13.5"
            strokeLinecap="round"
            strokeWidth="1.3"
            strokeOpacity="0.8"
          />
          <line
            x1="6"
            y1="13.5"
            x2="14"
            y2="13.5"
            strokeLinecap="round"
            strokeWidth="1.5"
          />
        </svg>
      </button>
      <button
        type="button"
        className="node-layer-btn"
        onClick={handleBackward}
        aria-label="Move layer down"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <polyline
            points="6 10.5 10 14.5 14 10.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
          <line
            x1="10"
            y1="14"
            x2="10"
            y2="6.5"
            strokeLinecap="round"
            strokeWidth="1.3"
            strokeOpacity="0.8"
          />
          <line
            x1="6"
            y1="6.5"
            x2="14"
            y2="6.5"
            strokeLinecap="round"
            strokeWidth="1.5"
          />
        </svg>
      </button>
    </div>
  )
}

export default NodeLayerControls
