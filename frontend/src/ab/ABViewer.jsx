import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Canvas, useLoader } from '@react-three/fiber'
import { OrbitControls, Environment, Center } from '@react-three/drei'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

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
  const snapshotUrl = `${backendUrl}${baseUrl}/moodboard_snapshot.png`

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

      {/* Moodboard reference */}
      <div style={s.snapshotWrap}>
        <p style={s.snapshotLabel}>Reference Moodboard</p>
        <img src={snapshotUrl} alt="moodboard" style={s.snapshot} />
      </div>

      {/* 3D model pair */}
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

      {/* Notes + Submit */}
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

const s = {
  page: {
    fontFamily: 'Segoe UI, sans-serif',
    maxWidth: 1100,
    margin: '0 auto',
    padding: '1.5rem',
    minHeight: '100vh',
    background: '#fff',
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '1.5rem',
    marginBottom: '1rem',
    borderBottom: '2px solid #000',
    paddingBottom: '0.75rem',
  },
  progress: {
    fontSize: '0.9rem',
    color: '#555',
    whiteSpace: 'nowrap',
  },
  caseTitle: {
    margin: 0,
    fontSize: '1.25rem',
  },
  snapshotWrap: {
    marginBottom: '1.25rem',
    textAlign: 'center',
  },
  snapshotLabel: {
    fontSize: '0.85rem',
    color: '#555',
    marginBottom: '0.4rem',
  },
  snapshot: {
    maxWidth: '100%',
    maxHeight: 220,
    border: '1px solid #ddd',
    objectFit: 'contain',
  },
  modelsRow: {
    display: 'flex',
    gap: '1.5rem',
    marginBottom: '1.25rem',
    flexWrap: 'wrap',
  },
  panel: {
    flex: 1,
    minWidth: 280,
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
    height: 380,
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
    margin: '0 auto',
  },
  notes: {
    padding: '0.6rem',
    fontSize: '0.9rem',
    border: '1px solid #ccc',
    resize: 'vertical',
    fontFamily: 'inherit',
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
