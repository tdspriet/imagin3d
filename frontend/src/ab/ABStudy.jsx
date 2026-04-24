import React, { useState, useEffect } from 'react'
import ABIntro from './ABIntro.jsx'
import ABViewer from './ABViewer.jsx'

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '')

export default function ABStudy() {
  const [participantId, setParticipantId] = useState(null)
  const [cases, setCases] = useState([])
  const [caseIndex, setCaseIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`${BACKEND_URL}/ab/cases`)
      .then(r => r.json())
      .then(data => { setCases(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const handleVote = async ({ preferred, leftArm, rightArm, notes }) => {
    const currentCase = cases[caseIndex]
    await fetch(`${BACKEND_URL}/ab/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case_id: currentCase.case_id,
        preferred,
        left_arm: leftArm,
        right_arm: rightArm,
        notes,
        participant_id: participantId,
      }),
    })
    if (caseIndex + 1 < cases.length) {
      setCaseIndex(i => i + 1)
    } else {
      setDone(true)
    }
  }

  if (!participantId) {
    return <ABIntro onStart={id => setParticipantId(id)} />
  }

  if (loading) return <CenteredMessage>Loading cases…</CenteredMessage>
  if (error) return <CenteredMessage>Error: {error}</CenteredMessage>
  if (cases.length === 0) return <CenteredMessage>No A/B cases found. Run the pipeline first.</CenteredMessage>

  if (done) {
    return (
      <CenteredMessage>
        <h2>Study complete — thank you!</h2>
        <p>All {cases.length} case{cases.length !== 1 ? 's' : ''} rated.</p>
      </CenteredMessage>
    )
  }

  return (
    <ABViewer
      caseData={cases[caseIndex]}
      caseNumber={caseIndex + 1}
      totalCases={cases.length}
      backendUrl={BACKEND_URL}
      onVote={handleVote}
    />
  )
}

function CenteredMessage({ children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif', padding: '2rem' }}>
      {children}
    </div>
  )
}
