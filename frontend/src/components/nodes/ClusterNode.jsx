import React, { useState, useEffect, useRef, useCallback } from 'react'
import { NodeResizer } from 'reactflow'
import { useMoodboardStore } from '../../store/moodboardStore'
import WeightOverlay from './WeightOverlay'
import './ClusterNode.css'

function ClusterNode({ id, data, selected }) {
  const { updateNodeData } = useMoodboardStore()
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [title, setTitle] = useState(data?.title || 'Cluster')
  const inputRef = useRef(null)

  useEffect(() => {
    setTitle(data?.title || 'Cluster')
  }, [data?.title])

  useEffect(() => {
    if (isEditingTitle && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditingTitle])

  const finishTitleEdit = useCallback(
    (nextTitle) => {
      const trimmed = nextTitle.trim()
      const fallback = trimmed.length > 0 ? trimmed : 'Cluster'
      setTitle(fallback)
      updateNodeData(id, { title: fallback })
      setIsEditingTitle(false)
    },
    [id, updateNodeData]
  )

  const handleHeaderDoubleClick = useCallback(
    (event) => {
      event.stopPropagation()
      event.preventDefault()
      if (!isEditingTitle) {
        setIsEditingTitle(true)
      }
    },
    [isEditingTitle]
  )

  const handleTitleKeyDown = useCallback(
    (event) => {
      event.stopPropagation()
      if (event.key === 'Enter') {
        event.preventDefault()
        finishTitleEdit(event.currentTarget.value)
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setTitle(data?.title || 'Cluster')
        setIsEditingTitle(false)
      }
    },
    [data?.title, finishTitleEdit]
  )

  const handleTitleBlur = useCallback(
    (event) => {
      finishTitleEdit(event.target.value)
    },
    [finishTitleEdit]
  )

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={240}
        minHeight={160}
        handleClassName="node-resizer-handle"
        lineClassName="node-resizer-line"
        handles={['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']}
      />
      <div className="cluster-node">
        <div
          className={`cluster-node-header${isEditingTitle ? ' cluster-node-header--editing' : ' react-flow-drag-handle cluster-node-header--draggable'}`}
          onDoubleClick={handleHeaderDoubleClick}
        >
          {isEditingTitle ? (
            <input
              ref={inputRef}
              className="cluster-title-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              onPointerDown={(event) => event.stopPropagation()}
              placeholder="Cluster title"
            />
          ) : (
            <span className="cluster-title" title={title}>
              {title}
            </span>
          )}
        </div>
        <div className="cluster-node-body" aria-hidden="true">
          <WeightOverlay weight={data?.weight} reasoning={data?.reasoning} />
        </div>
      </div>
    </>
  )
}

export default ClusterNode
