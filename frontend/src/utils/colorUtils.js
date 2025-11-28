export const randomHexColor = () => {
  const value = Math.floor(Math.random() * 0xffffff)
  return `#${value.toString(16).padStart(6, '0').toUpperCase()}`
}

export const generateRandomPalette = (count) => {
  const size = Number.isFinite(count) && count > 0 ? count : 1
  return Array.from({ length: size }, () => randomHexColor())
}

export const normalizeHexColor = (value) => {
  if (typeof value !== 'string') return null
  let hex = value.trim()
  if (!hex) return null
  if (hex[0] === '#') hex = hex.slice(1)
  if (hex.length === 3 && /^[0-9a-fA-F]{3}$/.test(hex)) {
    hex = hex.split('').map((char) => char + char).join('')
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null
  return `#${hex.toUpperCase()}`
}

export const weightToColor = (weight, opacity = 0.3) => {
  const clampedWeight = Math.max(0, Math.min(100, weight))
  
  let r, g
  if (clampedWeight <= 50) {
    // Red to yellow
    r = 255
    g = Math.round((clampedWeight / 50) * 255)
  } else {
    // Yellow to green
    r = Math.round(255 - ((clampedWeight - 50) / 50) * 255)
    g = 255
  }
  
  return `rgba(${r}, ${g}, 0, ${opacity})`
}
