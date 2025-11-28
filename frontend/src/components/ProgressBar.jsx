import React from 'react'
import './ProgressBar.css'

function ProgressBar({ current, total, stage, isVisible }) {
  if (!isVisible) return null

  const percentage = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div className="progress-bar">
      <div className="progress-bar__info">
        <span className="progress-bar__stage">{stage}</span>
      </div>
      <div className="progress-bar__track">
        <div
          className="progress-bar__fill"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

export default ProgressBar
