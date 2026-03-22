import React, { useEffect, useMemo, useRef, useState } from 'react'
import './ProgressBar.css'

const TRELLIS_ESTIMATE_MS = 1 * 60 * 1000

const formatElapsed = (elapsedMs = 0) => {
  const totalSeconds = Math.max(0, Math.round(elapsedMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function ProgressBar({
  current,
  total,
  stage,
  startedAt,
  finishedAt,
  lastElapsedMs,
  isVisible,
  compact = false,
}) {
  const trellisStage = useMemo(
    () => (stage || '').toLowerCase().includes('generating 3d model'),
    [stage]
  )
  const startTimeRef = useRef(null)
  const [estimatedPercentage, setEstimatedPercentage] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(lastElapsedMs || 0)

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
      const nextPercentage = Math.min(95, Math.round((elapsed / TRELLIS_ESTIMATE_MS) * 100))
      setEstimatedPercentage(nextPercentage)
    }

    tick()
    const interval = window.setInterval(tick, 200)
    return () => window.clearInterval(interval)
  }, [isVisible, trellisStage])

  useEffect(() => {
    if (!isVisible) {
      setElapsedMs(lastElapsedMs || 0)
      return
    }

    if (finishedAt) {
      setElapsedMs(lastElapsedMs || (startedAt ? finishedAt - startedAt : 0))
      return
    }

    if (!startedAt) {
      setElapsedMs(lastElapsedMs || 0)
      return
    }

    const tick = () => {
      setElapsedMs(Date.now() - startedAt)
    }

    tick()
    const interval = window.setInterval(tick, 250)
    return () => window.clearInterval(interval)
  }, [finishedAt, isVisible, lastElapsedMs, startedAt])

  if (!isVisible) return null

  const serverPercentage = total > 0 ? Math.round((current / total) * 100) : 0
  const percentage = trellisStage ? Math.max(serverPercentage, estimatedPercentage) : serverPercentage
  const showTimer = trellisStage

  return (
    <div className={`progress-bar${compact ? ' progress-bar--compact' : ''}`}>
      <span className="progress-bar__stage">{stage}</span>
      <div className="progress-bar__track">
        <div
          className="progress-bar__fill"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showTimer ? (
        <span className="progress-bar__timer">{formatElapsed(finishedAt ? lastElapsedMs : elapsedMs)}</span>
      ) : null}
    </div>
  )
}

export default ProgressBar
