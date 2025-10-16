import React, { useRef } from 'react'
import { useMoodboardStore } from '../store/moodboardStore'
import './Topbar.css'

/**
 * Topbar Component
 * Contains all action buttons for the moodboard
 */
function Topbar() {
  const { addImage, addVideo, addText, addFont, fitView, clearAll, saveMoodboard, loadMoodboard } = useMoodboardStore()
  const fileInputRef = useRef(null)
  const videoInputRef = useRef(null)
  const fontInputRef = useRef(null)
  const loadInputRef = useRef(null)

  // Handle image file selection
  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (event) => {
        addImage(event.target.result)
      }
      reader.readAsDataURL(file)
    }
    e.target.value = '' // Reset input
  }

  // Handle video file selection
  const handleVideoUpload = (e) => {
    const file = e.target.files[0]
    if (file && file.type.startsWith('video/')) {
      const reader = new FileReader()
      reader.onload = (event) => {
        addVideo(event.target.result)
      }
      reader.readAsDataURL(file)
    }
    e.target.value = '' // Reset input
  }

  // Handle font file selection
  const handleFontUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      const validExtensions = ['.otf', '.ttf', '.woff', '.woff2']
      const fileExtension = '.' + file.name.split('.').pop().toLowerCase()
      
      if (validExtensions.includes(fileExtension)) {
        const reader = new FileReader()
        reader.onload = (event) => {
          const fontData = event.target.result
          const fontName = file.name.split('.')[0]
          addFont(fontData, fontName)
        }
        reader.readAsDataURL(file)
      } else {
        alert('Please upload a valid font file (.otf, .ttf, .woff, .woff2)')
      }
    }
    e.target.value = '' // Reset input
  }

  // Handle moodboard file loading
  const handleLoadFile = (e) => {
    const file = e.target.files[0]
    if (file && file.type === 'application/json') {
      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result)
          loadMoodboard(data)
        } catch (error) {
          alert('Error loading moodboard: Invalid file format')
        }
      }
      reader.readAsText(file)
    }
    e.target.value = '' // Reset input
  }

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="logo">imagin3d</div>
        <button onClick={() => videoInputRef.current?.click()} className="btn">
          Add Video
        </button>
        <button onClick={() => fileInputRef.current?.click()} className="btn">
          Add Image
        </button>
        <button onClick={addText} className="btn">
          Add Text
        </button>
        <button onClick={() => fontInputRef.current?.click()} className="btn">
          Add Font
        </button>
      </div>

      <div className="topbar-right">
        <button onClick={fitView} className="btn btn-secondary">
          Fit View
        </button>
        <button onClick={clearAll} className="btn btn-danger">
          Clear All
        </button>
        <button onClick={saveMoodboard} className="btn btn-success">
          Save
        </button>
        <button onClick={() => loadInputRef.current?.click()} className="btn btn-success">
          Load
        </button>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        style={{ display: 'none' }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        onChange={handleVideoUpload}
        style={{ display: 'none' }}
      />
      <input
        ref={fontInputRef}
        type="file"
        accept=".otf,.ttf,.woff,.woff2"
        onChange={handleFontUpload}
        style={{ display: 'none' }}
      />
      <input
        ref={loadInputRef}
        type="file"
        accept=".json"
        onChange={handleLoadFile}
        style={{ display: 'none' }}
      />
    </div>
  )
}

export default Topbar
