import React, { useEffect, useMemo, useRef, useState } from 'react'
import './ProgressBar.css'

const TRELLIS_V1_ESTIMATE_MS = 1 * 60 * 1000
const TRELLIS_V2_ESTIMATE_MS = 1 * 60 * 1000 + 30 * 1000

function ProgressBar({ current, total, stage, isVisible, modelLabel }) {
  const trellisStage = useMemo(
    () => (stage || '').toLowerCase().includes('generating 3d model'),
    [stage]
  )
  const estimateDurationMs = useMemo(() => {
    const normalizedLabel = (modelLabel || '').toLowerCase()
    if (normalizedLabel.includes('trellisv2')) {
      return TRELLIS_V2_ESTIMATE_MS
    }
    if (normalizedLabel.includes('trellisv1')) {
      return TRELLIS_V1_ESTIMATE_MS
    }
    return TRELLIS_V2_ESTIMATE_MS
  }, [modelLabel])
  const startTimeRef = useRef(null)
  const [estimatedPercentage, setEstimatedPercentage] = useState(0)

  useEffect(() => {
    if (!isVisible || !trellisStage) {
      startTimeRef.current = null
      setEstimatedPercentage(0)
      return
    }

    startTimeRef.current = Date.now()
    setEstimatedPercentage(0)

    const tick = () => {
      if (!startTimeRef.current) return
      const elapsed = Date.now() - startTimeRef.current
      const nextPercentage = Math.min(95, Math.round((elapsed / estimateDurationMs) * 100))
      setEstimatedPercentage(nextPercentage)
    }

    tick()
    const interval = window.setInterval(tick, 200)
    return () => window.clearInterval(interval)
  }, [isVisible, trellisStage, estimateDurationMs])

  if (!isVisible) return null

  const serverPercentage = total > 0 ? Math.round((current / total) * 100) : 0
  const percentage = trellisStage ? Math.max(serverPercentage, estimatedPercentage) : serverPercentage

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
