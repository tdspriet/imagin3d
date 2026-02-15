import React, { useRef, useState } from 'react'
import { useMoodboardStore } from '../../store/moodboardStore'
import { weightToColor } from '../../utils/colorUtils'
import './WeightOverlay.css'

function WeightOverlay({ nodeId, weight }) {
  const editable = useMoodboardStore((s) => s.awaitingWeightsConfirmation)
  const updateWeight = useMoodboardStore((s) => s.updateNodeWeight)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)

  if (weight == null) return null

  const w = weight ?? 0

  const step = (delta) => (e) => {
    e.stopPropagation()
    e.preventDefault()
    if (editable && nodeId) updateWeight(nodeId, Math.max(0, Math.min(100, w + delta)))
  }

  const startEdit = (e) => {
    e.stopPropagation()
    e.preventDefault()
    if (!editable) return
    setDraft(String(w))
    setEditing(true)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }

  const commitEdit = () => {
    const parsed = parseInt(draft, 10)
    if (!isNaN(parsed) && nodeId) updateWeight(nodeId, parsed)
    setEditing(false)
  }

  return (
    <div className="weight-overlay" style={{ backgroundColor: weightToColor(w, 0.35) }} title={`Weight: ${w}`}>
      <div
        className="weight-overlay__controls"
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {editable && <button type="button" className="weight-overlay__btn" onClick={step(-5)}>−</button>}
        {editing ? (
          <input
            ref={inputRef}
            className="weight-overlay__input"
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') commitEdit()
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <span
            className={`weight-overlay__badge${editable ? ' weight-overlay__badge--editable' : ''}`}
            onDoubleClick={editable ? startEdit : undefined}
          >
            {w}
          </span>
        )}
        {editable && <button type="button" className="weight-overlay__btn" onClick={step(5)}>+</button>}
      </div>
    </div>
  )
}

export default WeightOverlay
