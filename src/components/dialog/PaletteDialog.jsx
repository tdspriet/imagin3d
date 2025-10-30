import React, { useEffect, useState } from 'react'
import { generateRandomPalette, normalizeHexColor, randomHexColor } from '../../utils/colorUtils'
import './PaletteDialog.css'

{/* TODO: clean up */}

const DEFAULT_COLOR_COUNT = 4
const MIN_COLORS = 1
const MAX_COLORS = 8

const createRandomManualPalette = () => generateRandomPalette(DEFAULT_COLOR_COUNT)

function PaletteDialog({ isOpen, onClose, onCreateManual }) {
  const [manualColors, setManualColors] = useState(createRandomManualPalette)

  useEffect(() => {
    if (!isOpen) {
      setManualColors(createRandomManualPalette())
      return undefined
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleManualColorChange = (index, value) => {
    const normalized = normalizeHexColor(value)
    if (!normalized) return
    setManualColors((current) => {
      const next = [...current]
      next[index] = normalized
      return next
    })
  }

  const handleManualAddColor = () => {
    setManualColors((current) => {
      if (current.length >= MAX_COLORS) return current
      return [...current, randomHexColor()]
    })
  }

  const handleManualRemoveColor = (index) => {
    setManualColors((current) => {
      if (current.length <= MIN_COLORS) return current
      return current.filter((_, idx) => idx !== index)
    })
  }

  const handleCreateManual = () => {
    const sanitized = manualColors.map((color) => normalizeHexColor(color)).filter(Boolean)
    if (!sanitized.length) return
    const result = onCreateManual?.(sanitized)
    if (result !== false) {
      onClose?.()
    }
  }

  if (!isOpen) {
    return null
  }

  const stripes = manualColors.length

  return (
    <div className="palette-dialog" role="dialog" aria-modal="true">
      <div
        className="palette-dialog__backdrop"
        onClick={() => {
          onClose?.()
        }}
      />
      <div className="palette-dialog__content" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="palette-dialog__close"
          onClick={() => {
            onClose?.()
          }}
          aria-label="Close"
        >
          ×
        </button>

        <header className="palette-dialog__header">
          <h2>New color palette</h2>
          <p>Pick the stripes and drop the palette on the board.</p>
        </header>

        <section className="palette-dialog__panel">
          <div className="palette-dialog__panel-header">
            <h3>Build manually</h3>
            <span>
              {stripes} color{stripes > 1 ? 's' : ''}
            </span>
          </div>
          <div className="palette-dialog__manual-preview">
            {manualColors.map((color, index) => (
              <div
                key={`manual-${index}`}
                className="palette-dialog__manual-color"
                style={{ backgroundColor: color }}
              >
                {manualColors.length > MIN_COLORS && (
                  <button
                    type="button"
                    className="palette-dialog__manual-remove"
                    onClick={() => handleManualRemoveColor(index)}
                    aria-label={`Remove color ${index + 1}`}
                  >
                    ×
                  </button>
                )}
                <input
                  type="color"
                  value={color}
                  onChange={(event) => handleManualColorChange(index, event.target.value)}
                />
              </div>
            ))}
            {manualColors.length < MAX_COLORS && (
              <button
                type="button"
                className="palette-dialog__manual-add"
                onClick={handleManualAddColor}
              >
                +
              </button>
            )}
          </div>
          <button type="button" className="palette-dialog__primary" onClick={handleCreateManual}>
            Place palette
          </button>
        </section>
      </div>
    </div>
  )
}

export default PaletteDialog
