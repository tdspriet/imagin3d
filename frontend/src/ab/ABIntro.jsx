import React, { useState } from 'react'

export default function ABIntro({ onStart }) {
  const [id, setId] = useState('')

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Imagin3D - A/B Preference Study</h1>
        <br></br>
        <p>
          In this study you will be shown a series of design moodboards, each
          accompanied by two anonymised 3D models generated from that board.
          Your task is to select which model better captures the overall design
          intent expressed by the moodboard.
        </p>
        <br></br>
        <ul style={{ lineHeight: 1.8 }}>
          <li>Rotate the models freely before deciding.</li>
          <li>You may leave a short comment explaining your choice.</li>
          <li>Take as long as you need per case.</li>
        </ul>

        <label style={styles.label}>
          Participant Name:
          <input
            style={styles.input}
            value={id}
            onChange={e => setId(e.target.value)}
            placeholder="e.g. John Doe"
            maxLength={20}
          />
        </label>

        <button
          style={{ ...styles.btn, opacity: id.trim() ? 1 : 0.4 }}
          disabled={!id.trim()}
          onClick={() => onStart(id.trim())}
        >
          Start
        </button>
      </div>
    </div>
  )
}

const styles = {
  page: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: '#f5f5f5',
    fontFamily: 'Segoe UI, sans-serif',
    padding: '2rem',
  },
  card: {
    background: '#fff',
    border: '2px solid #000',
    padding: '2.5rem',
    maxWidth: 600,
    width: '100%',
  },
  title: {
    marginTop: 0,
    fontSize: '1.6rem',
  },
  label: {
    display: 'block',
    marginTop: '1.5rem',
    marginBottom: '1rem',
    fontWeight: 'bold',
  },
  input: {
    display: 'block',
    marginTop: '0.5rem',
    padding: '0.5rem 0.75rem',
    fontSize: '1rem',
    border: '2px solid #000',
    width: '100%',
    boxSizing: 'border-box',
  },
  btn: {
    display: 'block',
    marginTop: '1.5rem',
    padding: '0.75rem 2rem',
    fontSize: '1rem',
    fontWeight: 'bold',
    background: '#000',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    width: '100%',
  },
}
