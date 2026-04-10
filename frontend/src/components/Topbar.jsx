import React, { useRef, useState } from 'react'
import {
  MdVideoLibrary,
  MdImage,
  MdTitle,
  MdFontDownload,
  MdViewInAr,
  MdGridOn,
  MdPalette,
  MdZoomOutMap,
  MdDeleteSweep,
  MdSave,
  MdFolderOpen,
  MdAutoAwesome,
} from 'react-icons/md'
import { useMoodboardStore } from '../store/moodboardStore'
import PaletteDialog from './dialog/PaletteDialog'
import GenerateDialog from './dialog/GenerateDialog'
import AdaptDialog from './dialog/AdaptDialog'
import './Topbar.css'

/**
 * Topbar Component
 * Contains all action buttons for the moodboard
 */
function Topbar() {
  const {
    addImage,
    addVideo,
    addText,
    addFont,
    addModel,
    addCluster,
    addPalette,
    fitView,
    clearAll,
    saveMoodboard,
    loadMoodboard,
    generateMoodboard,
    isGenerating,
    backendModelLabel,
  } = useMoodboardStore((state) => ({
    addImage: state.addImage,
    addVideo: state.addVideo,
    addText: state.addText,
    addFont: state.addFont,
    addModel: state.addModel,
    addCluster: state.addCluster,
    addPalette: state.addPalette,
    fitView: state.fitView,
    clearAll: state.clearAll,
    saveMoodboard: state.saveMoodboard,
    loadMoodboard: state.loadMoodboard,
    generateMoodboard: state.generateMoodboard,
    isGenerating: state.isGenerating,
    backendModelLabel: state.backendModelLabel,
  }))
  const fileInputRef = useRef(null)
  const videoInputRef = useRef(null)
  const fontInputRef = useRef(null)
  const modelInputRef = useRef(null)
  const loadInputRef = useRef(null)
  const [isPaletteDialogOpen, setPaletteDialogOpen] = useState(false)
  const [isGenerateDialogOpen, setGenerateDialogOpen] = useState(false)
  const [isAdaptDialogOpen, setAdaptDialogOpen] = useState(false)

  // Handle image file selection
  const handleImageUpload = (e) => {
    if (isGenerating) return
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
    if (isGenerating) return
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
    if (isGenerating) return
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

  // Handle 3D model file selection
  const handleModelUpload = (e) => {
    if (isGenerating) return
    const file = e.target.files[0]
    if (file) {
      const validExtensions = ['.glb', '.gltf']
      const fileExtension = '.' + file.name.split('.').pop().toLowerCase()
      
      if (validExtensions.includes(fileExtension)) {
        const reader = new FileReader()
        reader.onload = (event) => {
          const modelData = event.target.result
          const fileName = file.name
          addModel(modelData, fileName)
        }
        reader.readAsDataURL(file)
      } else {
        alert('Please upload a valid 3D model file (.glb, .gltf)')
      }
    }
    e.target.value = '' // Reset input
  }

  // Handle moodboard file loading
  const handleLoadFile = (e) => {
    if (isGenerating) return
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

  const handleAddCluster = () => {
    if (isGenerating) return
    const title = window.prompt('Choose a name for your cluster', 'New Cluster')
    if (title === null) {
      return
    }
    addCluster(title)
  }

  const handleCreateManualPalette = (colors) => {
    if (isGenerating) return false
    if (!Array.isArray(colors) || colors.length === 0) {
      return false
    }
    addPalette(colors, { origin: 'manual', colorCount: colors.length })
    return true
  }

  const handleGenerateMoodboard = async (prompt) => {
    // Close dialog immediately when starting generation
    setGenerateDialogOpen(false)
    
    try {
      const result = await generateMoodboard(prompt)
    } catch (error) {
      console.error('Failed to extract:', error)
    }
  }

  const handleAdaptMoodboard = async ({ subjectText, subjectFile, styleIntent }) => {
    setAdaptDialogOpen(false)
    
    try {
      const result = await generateMoodboard(styleIntent, subjectText, subjectFile)
    } catch (error) {
      console.error('Failed to adapt:', error)
    }
  }

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="logo">
          <img src="logo.png" alt="imagin3d logo" className="logo-mark" />
          <span className="logo-text">imagin3d</span>
        </div>
        <div className="topbar-add" role="group" aria-label="Add items">
          <button onClick={handleAddCluster} className="btn" disabled={isGenerating}>
            <MdGridOn className="btn-icon" size={18} aria-hidden="true" focusable="false" />
            <span>Add Cluster</span>
          </button>
          <button onClick={() => modelInputRef.current?.click()} className="btn" disabled={isGenerating}>
            <MdViewInAr className="btn-icon" size={18} aria-hidden="true" focusable="false" />
            <span>Add 3D</span>
          </button>
          <button onClick={() => videoInputRef.current?.click()} className="btn" disabled={isGenerating}>
            <MdVideoLibrary className="btn-icon" size={18} aria-hidden="true" focusable="false" />
            <span>Add Video</span>
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="btn" disabled={isGenerating}>
            <MdImage className="btn-icon" size={18} aria-hidden="true" focusable="false" />
            <span>Add Image</span>
          </button>
          <button onClick={addText} className="btn" disabled={isGenerating}>
            <MdTitle className="btn-icon" size={18} aria-hidden="true" focusable="false" />
            <span>Add Text</span>
          </button>
          {/*
          <button onClick={() => fontInputRef.current?.click()} className="btn" disabled={isGenerating}>
            <MdFontDownload className="btn-icon" size={18} aria-hidden="true" focusable="false" />
            <span>Add Font</span>
          </button>
          */}
          <button onClick={() => setPaletteDialogOpen(true)} className="btn" disabled={isGenerating}>
            <MdPalette className="btn-icon" size={18} aria-hidden="true" focusable="false" />
            <span>Add Palette</span>
          </button>
        </div>
      </div>

      <div className="topbar-right">
        <button onClick={fitView} className="btn btn-secondary">
          <MdZoomOutMap className="btn-icon" size={18} aria-hidden="true" focusable="false" />
          <span>Fit View</span>
        </button>
        <button onClick={clearAll} className="btn btn-danger" disabled={isGenerating}>
          <MdDeleteSweep className="btn-icon" size={18} aria-hidden="true" focusable="false" />
          <span>Clear All</span>
        </button>
        <button onClick={saveMoodboard} className="btn btn-success">
          <MdSave className="btn-icon" size={18} aria-hidden="true" focusable="false" />
          <span>Save</span>
        </button>
        <button onClick={() => loadInputRef.current?.click()} className="btn btn-success" disabled={isGenerating}>
          <MdFolderOpen className="btn-icon" size={18} aria-hidden="true" focusable="false" />
          <span>Load</span>
        </button>
        <div className="topbar-generate">
          <button onClick={() => setAdaptDialogOpen(true)} className="btn btn-warning" disabled={isGenerating}>
            <MdAutoAwesome className="btn-icon" size={18} aria-hidden="true" focusable="false" />
            <span>Adapt</span>
          </button>
          <button onClick={() => setGenerateDialogOpen(true)} className="btn btn-warning" disabled={isGenerating}>
            <MdAutoAwesome className="btn-icon" size={18} aria-hidden="true" focusable="false" />
            <span>Generate</span>
          </button>
          {backendModelLabel && <span className="topbar-model-label">{backendModelLabel}</span>}
        </div>
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
        ref={modelInputRef}
        type="file"
        accept=".glb,.gltf"
        onChange={handleModelUpload}
        style={{ display: 'none' }}
      />
      <input
        ref={loadInputRef}
        type="file"
        accept=".json"
        onChange={handleLoadFile}
        style={{ display: 'none' }}
      />
      <PaletteDialog
        isOpen={isPaletteDialogOpen}
        onClose={() => setPaletteDialogOpen(false)}
        onCreateManual={handleCreateManualPalette}
      />
      <GenerateDialog
        isOpen={isGenerateDialogOpen}
        onClose={() => setGenerateDialogOpen(false)}
        onGenerate={handleGenerateMoodboard}
        isGenerating={isGenerating}
      />
      <AdaptDialog
        isOpen={isAdaptDialogOpen}
        onClose={() => setAdaptDialogOpen(false)}
        onAdapt={handleAdaptMoodboard}
        isGenerating={isGenerating}
      />
    </div>
  )
}

export default Topbar
