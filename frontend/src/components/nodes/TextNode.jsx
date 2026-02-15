import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { NodeResizer } from 'reactflow'
import { MdTextIncrease, MdTextDecrease } from 'react-icons/md'
import { useMoodboardStore } from '../../store/moodboardStore'
import NodeLayerControls from './NodeLayerControls'
import WeightOverlay from './WeightOverlay'
import './TextNode.css'

const DEFAULT_PLACEHOLDER = 'Double-click to edit'

/**
 * TextNode Component
 * Displays editable text in a resizable box
 * Double-click to edit, size adjusts by resizing the node
 */
function TextNode({ id, data, selected }) {
  const [isEditing, setIsEditing] = useState(false)
  const [text, setText] = useState(data.text || DEFAULT_PLACEHOLDER)
  const [fontSize, setFontSize] = useState(data.fontSize || 16)
  const textareaRef = useRef(null)
  const containerRef = useRef(null)
  const contentRef = useRef(null)
  const lastHeightRef = useRef(null)
  const { updateNodeData, setNodeDimensions } = useMoodboardStore()
  const isGenerating = useMoodboardStore((s) => s.isGenerating)

  const applyHeight = useCallback(
    (measuredHeight) => {
      if (!Number.isFinite(measuredHeight)) return
      const paddingY = 16 // .text-node has 8px top/bottom padding
      const minHeight = 30
      const desiredHeight = Math.max(minHeight, measuredHeight + paddingY)

      if (lastHeightRef.current === null || Math.abs(lastHeightRef.current - desiredHeight) > 0.5) {
        lastHeightRef.current = desiredHeight
        setNodeDimensions(id, { height: desiredHeight })
      }
    },
    [id, setNodeDimensions]
  )

  const adjustHeight = useCallback(() => {
    if (isEditing && textareaRef.current) {
      const textarea = textareaRef.current
      textarea.style.height = 'auto'
      const scrollHeight = textarea.scrollHeight
      textarea.style.height = `${scrollHeight}px`
      applyHeight(scrollHeight)
    } else if (contentRef.current) {
      applyHeight(contentRef.current.offsetHeight)
    }
  }, [applyHeight, isEditing])

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (!isEditing || !textareaRef.current) return
    const textarea = textareaRef.current
    textarea.focus()
    const value = textarea.value
    if (!value || value === DEFAULT_PLACEHOLDER) {
      textarea.select()
    } else {
      const cursorPos = value.length
      textarea.setSelectionRange(cursorPos, cursorPos)
    }
  }, [isEditing])

  // Handle double-click to enter edit mode
  const handleDoubleClick = () => {
    if (!isGenerating) setIsEditing(true)
  }

  // Handle text change
  const handleTextChange = (e) => {
    setText(e.target.value)
    if (textareaRef.current) {
      const textarea = textareaRef.current
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight}px`
    }
  }

  // Handle blur - exit edit mode and save
  const handleBlur = () => {
    setIsEditing(false)
    updateNodeData(id, { text, fontSize })
  }

  // Handle keyboard shortcuts
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsEditing(false)
      textareaRef.current?.blur()
    }
    // Prevent delete key from deleting the node while editing
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.stopPropagation()
    }
  }

  const handleControlDoubleClick = useCallback((e) => {
    e.stopPropagation()
    e.preventDefault()
  }, [])

  // Increase font size
  const increaseFontSize = (e) => {
    e.stopPropagation()
    const newSize = fontSize + 2
    setFontSize(newSize)
    updateNodeData(id, { text, fontSize: newSize })
  }

  // Decrease font size
  const decreaseFontSize = (e) => {
    e.stopPropagation()
    const newSize = Math.max(8, fontSize - 2)
    setFontSize(newSize)
    updateNodeData(id, { text, fontSize: newSize })
  }

  // Keep node height in sync with content size
  useLayoutEffect(() => {
    adjustHeight()
  }, [text, fontSize, isEditing, adjustHeight])

  useEffect(() => {
    adjustHeight()
  }, [])

  useEffect(() => {
    const element = containerRef.current
    if (!element || typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(() => {
      adjustHeight()
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [adjustHeight])

  return (
    <>
      <NodeResizer
        isVisible={selected && !isGenerating}
        minWidth={100}
        minHeight={30}
        lineClassName="node-resizer-line"
        handleClassName="node-resizer-handle"
      />
      <div className="node-frame">
        <NodeLayerControls id={id} isVisible={selected && !isEditing && !isGenerating} />
        <div className="text-node" onDoubleClick={handleDoubleClick} ref={containerRef}>
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className="text-editor"
              style={{ fontSize: `${fontSize}px` }}
            />
          ) : (
            <div
              className="text-display"
              style={{ fontSize: `${fontSize}px` }}
              ref={contentRef}
            >
              {text}
            </div>
          )}
          {selected && !isEditing && !isGenerating && (
            <div className="font-size-controls" onDoubleClick={handleControlDoubleClick}>
              <button
                onClick={increaseFontSize}
                onDoubleClick={handleControlDoubleClick}
                className="font-size-btn"
              >
                <MdTextIncrease className="font-size-icon" size={16} aria-hidden="true" focusable="false" />
              </button>
              <button
                onClick={decreaseFontSize}
                onDoubleClick={handleControlDoubleClick}
                className="font-size-btn"
              >
                <MdTextDecrease className="font-size-icon" size={16} aria-hidden="true" focusable="false" />
              </button>
            </div>
          )}
          <WeightOverlay nodeId={id} weight={data.weight} />
        </div>
      </div>
    </>
  )
}

export default TextNode
