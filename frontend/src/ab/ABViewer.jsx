import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Canvas, useLoader } from '@react-three/fiber'
import { OrbitControls, Environment, Center } from '@react-three/drei'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import MoodboardPreview from './MoodboardPreview'

export default function ABViewer({ caseData, caseNumber, totalCases, backendUrl, onVote }) {
  const [notes, setNotes] = useState('')
  const [preferred, setPreferred] = useState(null)   // 'left' | 'right'

  // Randomise which arm appears on which side (per case, deterministic via case_id hash)
  const { leftArm, rightArm } = useMemo(() => {
    const hash = caseData.case_id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const flip = hash % 2 === 0
    return flip
      ? { leftArm: 'imagin3d', rightArm: 'baseline' }
      : { leftArm: 'baseline', rightArm: 'imagin3d' }
  }, [caseData.case_id])

  const baseUrl = caseData._base_url  // e.g. /ab-runs/20260423-143000_example_chair

  const leftGlb  = `${backendUrl}${baseUrl}/${leftArm}/sample.glb`
  const rightGlb = `${backendUrl}${baseUrl}/${rightArm}/sample.glb`

  const hasMoodboard = !!caseData.moodboard?.elements?.length

  const handleSubmit = () => {
    if (!preferred) return
    onVote({ preferred, leftArm, rightArm, notes })
    setPreferred(null)
    setNotes('')
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.progress}>Case {caseNumber} / {totalCases}</span>
        <h2 style={s.caseTitle}>Which model better captures this moodboard?</h2>
      </div>

      {/* Main content */}
      <div style={s.body}>
        {/* Left: reference moodboard */}
        {hasMoodboard && (
          <div style={s.moodboardCol}>
            <p style={s.colLabel}>Reference Moodboard</p>
            <div style={s.moodboardCanvas}>
              <MoodboardPreview
                elements={caseData.moodboard.elements}
                clusters={caseData.moodboard.clusters || []}
                baseUrl={baseUrl}
                backendUrl={backendUrl}
              />
            </div>
          </div>
        )}

        {/* Right: A/B comparison */}
        <div style={{ ...s.comparisonCol, flex: hasMoodboard ? '0 0 62%' : '1' }}>
          {caseData.prompt && (
            <p style={s.promptLabel}>{caseData.prompt}</p>
          )}
          <div style={s.modelsRow}>
            <ModelPanel
              label="A"
              glbUrl={leftGlb}
              selected={preferred === 'left'}
              onSelect={() => setPreferred('left')}
            />
            <ModelPanel
              label="B"
              glbUrl={rightGlb}
              selected={preferred === 'right'}
              onSelect={() => setPreferred('right')}
            />
          </div>

          <div style={s.submitArea}>
            <textarea
              style={s.notes}
              placeholder="Optional: briefly explain your choice…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
            />
            <button
              style={{ ...s.btn, opacity: preferred ? 1 : 0.4 }}
              disabled={!preferred}
              onClick={handleSubmit}
            >
              {caseNumber < totalCases ? `Submit & next →` : `Submit & finish`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModelPanel({ label, glbUrl, selected, onSelect }) {
  return (
    <div
      style={{ ...s.panel, border: selected ? '3px solid #000' : '2px solid #ccc', cursor: 'pointer' }}
      onClick={onSelect}
    >
      <div style={s.panelLabel}>{label}</div>
      <div style={s.canvasWrap}>
        <GLBViewer url={glbUrl} />
      </div>
      <button
        style={{ ...s.selectBtn, background: selected ? '#000' : '#fff', color: selected ? '#fff' : '#000' }}
        onClick={e => { e.stopPropagation(); onSelect() }}
      >
        {selected ? '✓ Selected' : 'Select'}
      </button>
    </div>
  )
}

function GLBScene({ url }) {
  const gltf = useLoader(GLTFLoader, url)
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 3]} intensity={1.2} />
      <Center>
        <primitive object={gltf.scene} />
      </Center>
      <OrbitControls enablePan={false} />
    </>
  )
}

function GLBViewer({ url }) {
  const [error, setError] = useState(false)

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: '#888', fontSize: '0.9rem' }}>
        Model not available
      </div>
    )
  }

  return (
    <React.Suspense fallback={<Loading />}>
      <ErrorBoundaryGLB onError={() => setError(true)}>
        <Canvas camera={{ position: [0, 0.5, 2.5], fov: 45 }} style={{ background: '#f9f9f9' }}>
          <GLBScene url={url} />
        </Canvas>
      </ErrorBoundaryGLB>
    </React.Suspense>
  )
}

function Loading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', color: '#888' }}>Loading…</div>
  )
}

class ErrorBoundaryGLB extends React.Component {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch() { this.props.onError?.() }
  render() {
    return this.state.hasError ? null : this.props.children
  }
}

const HEADER_H = 64  // px — kept in sync with s.header padding + font size

const s = {
  page: {
    fontFamily: 'Segoe UI, sans-serif',
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#fff',
    overflow: 'hidden',
  },
  header: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    padding: '0 1.5rem',
    height: `${HEADER_H}px`,
    flexShrink: 0,
    borderBottom: '2px solid #000',
  },
  progress: {
    fontSize: '0.9rem',
    color: '#555',
    whiteSpace: 'nowrap',
  },
  caseTitle: {
    margin: 0,
    fontSize: '1.25rem',
    gridColumn: 2,
    textAlign: 'center',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  moodboardCol: {
    flex: '0 0 38%',
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid #e0e0e0',
    overflow: 'hidden',
  },
  colLabel: {
    margin: 0,
    padding: '8px 12px',
    fontSize: '0.8rem',
    color: '#555',
    borderBottom: '1px solid #e0e0e0',
    flexShrink: 0,
  },
  moodboardCanvas: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  comparisonCol: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '1.25rem 1.5rem',
    overflowY: 'auto',
    gap: '1.25rem',
  },
  promptLabel: {
    margin: 0,
    fontSize: '1rem',
    fontStyle: 'italic',
    color: '#444',
    textAlign: 'center',
  },
  modelsRow: {
    display: 'flex',
    gap: '1.5rem',
    flexWrap: 'wrap',
  },
  panel: {
    flex: 1,
    minWidth: 240,
    borderRadius: 2,
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  panelLabel: {
    fontWeight: 'bold',
    fontSize: '1.3rem',
    textAlign: 'center',
    letterSpacing: 2,
  },
  canvasWrap: {
    height: 320,
    background: '#f9f9f9',
    overflow: 'hidden',
  },
  selectBtn: {
    width: '100%',
    padding: '0.6rem',
    fontWeight: 'bold',
    border: '2px solid #000',
    cursor: 'pointer',
    fontSize: '0.95rem',
  },
  submitArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    maxWidth: 600,
    width: '100%',
    margin: '0 auto',
  },
  notes: {
    padding: '0.6rem',
    fontSize: '0.9rem',
    border: '1px solid #ccc',
    resize: 'vertical',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  btn: {
    padding: '0.85rem',
    fontWeight: 'bold',
    fontSize: '1rem',
    background: '#000',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
  },
}
