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

const rgbToHex = (r, g, b) => (
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`
)

const squaredDist = (a, b) => {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]
  return dr * dr + dg * dg + db * db
}

export const extractDominantColorsFromImage = async (file, count = 4) => {
  const targetCount = Math.max(1, Math.min(8, Number(count) || 4))
  if (!file) return generateRandomPalette(targetCount)

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
      image.src = objectUrl
    })

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return generateRandomPalette(targetCount)

    const scale = Math.min(1, 150 / Math.max(image.width, image.height))
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)

    // Quantize each pixel to a 4-bit-per-channel bin (32 levels × 3 = 32768 bins)
    // All similar colors land in the same bin — no more duplicate tints
    const bins = new Map()
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 125) continue
      const r = data[i] >> 3, g = data[i + 1] >> 3, b = data[i + 2] >> 3
      const key = (r << 10) | (g << 5) | b
      const entry = bins.get(key)
      if (entry) {
        entry.sum[0] += data[i]; entry.sum[1] += data[i + 1]; entry.sum[2] += data[i + 2]
        entry.count += 1
      } else {
        bins.set(key, { sum: [data[i], data[i + 1], data[i + 2]], count: 1 })
      }
    }

    if (!bins.size) return generateRandomPalette(targetCount)

    // Average each bin and sort by pixel count (most common first)
    const colors = [...bins.values()]
      .map(({ sum, count }) => ({
        color: sum.map((v) => Math.round(v / count)),
        count,
      }))
      .sort((a, b) => b.count - a.count)

    // Start with the most common color, then greedily pick the one furthest from all picks
    const picks = [colors[0]]
    const used = new Set([0])
    while (picks.length < targetCount && used.size < colors.length) {
      let bestIdx = -1, bestDist = -1
      for (let i = 0; i < colors.length; i += 1) {
        if (used.has(i)) continue
        let minD = Infinity
        for (const p of picks) {
          const d = squaredDist(p.color, colors[i].color)
          if (d < minD) minD = d
        }
        if (minD > bestDist) { bestDist = minD; bestIdx = i }
      }
      if (bestIdx < 0) break
      picks.push(colors[bestIdx])
      used.add(bestIdx)
    }

    const result = picks.map(({ color }) => rgbToHex(color[0], color[1], color[2]))
    while (result.length < targetCount) result.push(randomHexColor())
    return result.slice(0, targetCount)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
