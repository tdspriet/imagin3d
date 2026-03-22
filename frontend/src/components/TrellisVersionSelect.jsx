import React from 'react'
import './TrellisVersionSelect.css'

function TrellisVersionSelect({ value = 2, onChange, compact = false, disabled = false, workspaceLabel = 'workspace' }) {
  return (
    <label className={`trellis-version-select${compact ? ' trellis-version-select--compact' : ''}`}>
      <span className="trellis-version-select__label">Model</span>
      <select
        className="trellis-version-select__control"
        value={value}
        onChange={(event) => onChange?.(Number(event.target.value))}
        disabled={disabled}
        aria-label={`Select TRELLIS version for ${workspaceLabel}`}
      >
        <option value={1}>Trellis V1</option>
        <option value={2}>Trellis V2</option>
      </select>
    </label>
  )
}

export default TrellisVersionSelect
