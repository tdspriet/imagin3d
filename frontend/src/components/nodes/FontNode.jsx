import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { useMoodboardStore } from '../../store/moodboardStore'
import NodeLayerControls from './NodeLayerControls'
import './FontNode.css'

/**
 * FontNode Component
 * Displays the font name as text using that font
 * Loads custom font files (.otf, .ttf, .woff, .woff2)
 */
function FontNode({ id, data, selected }) {
  const [fontSize, setFontSize] = useState(data.fontSize || 24)
  const [fontFamily] = useState(data.fontFamily || 'Arial')
  const { updateNodeData, setNodeDimensions } = useMoodboardStore()
  const isGenerating = useMoodboardStore((s) => s.isGenerating)
  const displayRef = useRef(null)
  const lastWidthRef = useRef(null)
  const lastHeightRef = useRef(null)

  const handleControlDoubleClick = useCallback((e) => {
    e.stopPropagation()
    e.preventDefault()
  }, [])

  const updateDimensionsToFit = useCallback(() => {
    const element = displayRef.current
    if (!element) return

    const paddingX = 16 // .font-node has 8px horizontal padding on each side
    const paddingY = 16 // .font-node has 8px vertical padding top/bottom
    const minWidth = 150
    const minHeight = 40
    const measuredWidth = element.scrollWidth
    const measuredHeight = element.scrollHeight
    if (!Number.isFinite(measuredWidth) || !Number.isFinite(measuredHeight)) return

    const desiredWidth = Math.max(minWidth, measuredWidth + paddingX)
    const desiredHeight = Math.max(minHeight, measuredHeight + paddingY)
    const dimensionUpdate = {}

    if (lastWidthRef.current === null || Math.abs(lastWidthRef.current - desiredWidth) > 0.5) {
      lastWidthRef.current = desiredWidth
      dimensionUpdate.width = desiredWidth
    }

    if (lastHeightRef.current === null || Math.abs(lastHeightRef.current - desiredHeight) > 0.5) {
      lastHeightRef.current = desiredHeight
      dimensionUpdate.height = desiredHeight
    }

    if (Object.keys(dimensionUpdate).length > 0) {
      setNodeDimensions(id, dimensionUpdate)
    }
  }, [id, setNodeDimensions])

  // Increase font size
  const increaseFontSize = (e) => {
    e.stopPropagation()
    const newSize = fontSize + 2
    setFontSize(newSize)
    updateNodeData(id, { ...data, fontSize: newSize })
  }

  // Decrease font size
  const decreaseFontSize = (e) => {
    e.stopPropagation()
    const newSize = Math.max(8, fontSize - 2)
    setFontSize(newSize)
    updateNodeData(id, { ...data, fontSize: newSize })
  }

  // Load custom font on mount if already uploaded
  useEffect(() => {
    if (data.fontLoaded && data.fontData && data.uniqueFontFamily) {
      const style = document.createElement('style')
      style.textContent = `
        @font-face {
          font-family: '${data.uniqueFontFamily}';
          src: url(${data.fontData});
        }
      `
      document.head.appendChild(style)
    }
  }, [])

  useLayoutEffect(() => {
    updateDimensionsToFit()
  }, [fontSize, fontFamily, data.uniqueFontFamily, updateDimensionsToFit])

  useEffect(() => {
    const element = displayRef.current
    if (!element || typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(() => {
      updateDimensionsToFit()
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [updateDimensionsToFit])

  return (
    <div className="node-frame">
      <NodeLayerControls id={id} isVisible={selected && !isGenerating} />
      <div className="font-node">
        <div
          className="font-display"
          style={{
            fontSize: `${fontSize}px`,
            fontFamily: data.uniqueFontFamily || 'Arial',
          }}
          ref={displayRef}
        >
          {fontFamily}
        </div>
        {selected && !isGenerating && (
          <div className="font-size-controls" onDoubleClick={handleControlDoubleClick}>
            <button
              onClick={increaseFontSize}
              onDoubleClick={handleControlDoubleClick}
              className="font-size-btn"
            >
              ↑
            </button>
            <button
              onClick={decreaseFontSize}
              onDoubleClick={handleControlDoubleClick}
              className="font-size-btn"
            >
              ↓
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default FontNode
