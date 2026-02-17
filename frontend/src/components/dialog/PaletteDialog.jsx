import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  extractDominantColorsFromImage,
  generateRandomPalette,
  normalizeHexColor,
  randomHexColor,
} from '../../utils/colorUtils'
import './PaletteDialog.css'

const DEFAULT_COLOR_COUNT = 4
const MIN_COLORS = 1
const MAX_COLORS = 8

const createRandomManualPalette = () => generateRandomPalette(DEFAULT_COLOR_COUNT)

function PaletteDialog({ isOpen, onClose, onCreateManual }) {
  const [manualColors, setManualColors] = useState(createRandomManualPalette)
  const [isExtracting, setIsExtracting] = useState(false)
  const imageInputRef = useRef(null)
  const extractionRequestRef = useRef(0)
  const stripes = manualColors.length
  const canAddColor = stripes < MAX_COLORS
  const canRemoveColor = stripes > MIN_COLORS

  const handleClose = useCallback(() => {
    onClose?.()
  }, [onClose])

  useEffect(() => {
    if (!isOpen) {
      extractionRequestRef.current += 1
      setManualColors(createRandomManualPalette())
      setIsExtracting(false)
      if (imageInputRef.current) {
        imageInputRef.current.value = ''
      }
      return
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleClose])

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

  const handleColorCountChange = (value) => {
    const nextCount = Math.max(MIN_COLORS, Math.min(MAX_COLORS, Number(value) || MIN_COLORS))
    setManualColors((current) => {
      if (current.length === nextCount) return current
      if (current.length > nextCount) return current.slice(0, nextCount)
      return [...current, ...generateRandomPalette(nextCount - current.length)]
    })
  }

  const handleExtractButtonClick = () => {
    imageInputRef.current?.click()
  }

  const handleExtractImageUpload = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !file.type.startsWith('image/')) return

    const requestId = extractionRequestRef.current + 1
    extractionRequestRef.current = requestId
    setIsExtracting(true)
    try {
      const extracted = await extractDominantColorsFromImage(file, stripes)
      if (extractionRequestRef.current !== requestId) return
      if (extracted.length > 0) {
        setManualColors(extracted)
      }
    } catch (error) {
      if (extractionRequestRef.current !== requestId) return
      console.error('Failed to extract colors from image', error)
      alert('Could not extract colors from this image. Try another image.')
    } finally {
      if (extractionRequestRef.current === requestId) {
        setIsExtracting(false)
      }
    }
  }

  const handleCreateManual = () => {
    const sanitized = manualColors.map(normalizeHexColor).filter(Boolean)
    if (!sanitized.length) return
    const result = onCreateManual?.(sanitized)
    if (result !== false) {
      handleClose()
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="palette-dialog" role="dialog" aria-modal="true">
      <div
        className="palette-dialog__backdrop"
        onClick={handleClose}
      />
      <div className="palette-dialog__content" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="palette-dialog__close"
          onClick={handleClose}
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
            <h3>Build Palette</h3>
            <label className="palette-dialog__count-control">
              <span>Colors</span>
              <select
                aria-label="Select number of colors"
                value={stripes}
                onChange={(event) => handleColorCountChange(event.target.value)}
              >
                {Array.from({ length: MAX_COLORS }, (_, index) => index + 1).map((count) => (
                  <option key={`count-${count}`} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="palette-dialog__manual-preview">
            {manualColors.map((color, index) => (
              <div
                key={`manual-${index}`}
                className="palette-dialog__manual-color"
                style={{ backgroundColor: color }}
              >
                {canRemoveColor && (
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
            {canAddColor && (
              <button
                type="button"
                className="palette-dialog__manual-add"
                onClick={handleManualAddColor}
                aria-label="Add color"
              >
                +
              </button>
            )}
          </div>
          <div className="palette-dialog__panel-actions">
            <button
              type="button"
              className="palette-dialog__secondary"
              onClick={handleExtractButtonClick}
              disabled={isExtracting}
            >
              {isExtracting ? 'Extracting...' : 'Extract from Image'}
            </button>
          </div>
        </section>
        <div className="palette-dialog__footer">
          <button type="button" className="palette-dialog__primary" onClick={handleCreateManual}>
            Place Palette
          </button>
        </div>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={handleExtractImageUpload}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  )
}

export default PaletteDialog
