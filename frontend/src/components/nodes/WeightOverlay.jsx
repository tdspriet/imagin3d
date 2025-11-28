import React from 'react'
import { weightToColor } from '../../utils/colorUtils'
import './WeightOverlay.css'

function WeightOverlay({ weight, reasoning }) {
  // Only show if weight is defined
  if (weight === undefined || weight === null) {
    return null
  }

  const overlayColor = weightToColor(weight, 0.35)

  return (
    <div
      className="weight-overlay"
      style={{ backgroundColor: overlayColor }}
      title={reasoning || `Weight: ${weight}`}
    >
      <span className="weight-overlay__badge">{weight}</span>
    </div>
  )
}

export default WeightOverlay
