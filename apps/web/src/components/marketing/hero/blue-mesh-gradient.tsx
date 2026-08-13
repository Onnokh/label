import { useEffect, useRef } from "react"

const definitions = {
  // Geometry from the mesh-gradient handoff, with a cooler take on Sleevy's
  // original indigo and wine-magenta palette.
  hero: {
    base: [13, 16, 30],
    anchors: [
      { x: 0.19, y: 0.32, color: [47, 83, 164], reach: 0.76, radius: 0.52 },
      { x: 0.84, y: 0.14, color: [128, 57, 127], reach: 0.52, radius: 0.72 },
      { x: 0.06, y: 0.94, color: [105, 25, 84], reach: 0.78, radius: 0.4 },
      { x: 0.55, y: 0.68, color: [82, 91, 169], reach: 0.98, radius: 0.62 },
    ],
  },
  share: {
    base: [29, 25, 44],
    anchors: [
      { x: 0.1, y: 0.2, color: [60, 84, 148], reach: 0.62, radius: 0.48 },
      { x: 0.88, y: 0.34, color: [112, 62, 109], reach: 0.68, radius: 0.64 },
      { x: 0.24, y: 0.94, color: [84, 39, 82], reach: 0.68, radius: 0.42 },
      { x: 0.56, y: 0.66, color: [87, 79, 137], reach: 0.82, radius: 0.58 },
    ],
  },
  workflow: {
    base: [27, 24, 42],
    anchors: [
      { x: 0.24, y: 0.16, color: [56, 76, 142], reach: 0.6, radius: 0.52 },
      { x: 0.78, y: 0.2, color: [118, 67, 112], reach: 0.56, radius: 0.7 },
      { x: 0.08, y: 0.78, color: [82, 42, 84], reach: 0.72, radius: 0.44 },
      { x: 0.62, y: 0.74, color: [88, 71, 129], reach: 0.9, radius: 0.6 },
    ],
  },
  footer: {
    base: [8, 9, 15],
    anchors: [
      { x: 0.08, y: 0.14, color: [55, 30, 78], reach: 0.7, radius: 0.58 },
      { x: 0.88, y: 0.86, color: [32, 62, 123], reach: 0.7, radius: 0.6 },
    ],
  },
  login: {
    base: [10, 11, 21],
    anchors: [
      { x: 0.12, y: 0.82, color: [112, 18, 77], reach: 0.8, radius: 0.62 },
      { x: 0.82, y: 0.22, color: [44, 77, 157], reach: 0.74, radius: 0.68 },
      { x: 0.58, y: 0.62, color: [98, 45, 119], reach: 0.78, radius: 0.6 },
    ],
  },
  settings: {
    base: [13, 14, 25],
    anchors: [
      { x: 0.08, y: 0.86, color: [43, 62, 134], reach: 0.72, radius: 0.58 },
      { x: 0.88, y: 0.1, color: [95, 35, 96], reach: 0.68, radius: 0.62 },
      { x: 0.55, y: 0.45, color: [58, 66, 142], reach: 0.74, radius: 0.6 },
    ],
  },
} as const

const falloff = 1.75
// Keep the field present but comfortably behind the product imagery and copy.
const illumination = {
  hero: 0.42,
  share: 0.29,
  workflow: 0.29,
  footer: 0.24,
  login: 0.36,
  settings: 0.3,
} as const

const canvasStyle = {
  position: "absolute",
  inset: "-3%",
  width: "106%",
  height: "106%",
  filter: "blur(12px) saturate(1.3)",
} as const

/** A dependency-free, soft-field canvas implementation of the selected mesh. */
export function BlueMeshGradient({ variant = "hero" }: { variant?: keyof typeof definitions }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const render = () => {
      const { width, height } = canvas.getBoundingClientRect()
      if (!width || !height) return

      // Deliberately render at a restrained resolution, then soften it with CSS.
      // That retains the generator's velvety field rather than crisp radial bands.
      const sampleWidth = 280
      const sampleHeight = Math.max(1, Math.round(sampleWidth * (height / width)))
      canvas.width = sampleWidth
      canvas.height = sampleHeight

      const context = canvas.getContext("2d")
      if (!context) return
      const image = context.createImageData(sampleWidth, sampleHeight)
      const definition = definitions[variant]

      for (let y = 0; y < sampleHeight; y += 1) {
        for (let x = 0; x < sampleWidth; x += 1) {
          const pointX = x / (sampleWidth - 1)
          const pointY = y / (sampleHeight - 1)
          let [red, green, blue] = definition.base

          for (const anchor of definition.anchors) {
            const distanceSquared = (pointX - anchor.x) ** 2 + (pointY - anchor.y) ** 2
            const spread = (anchor.radius * anchor.reach) ** 2
            const weight = Math.exp((-falloff * distanceSquared) / spread) * illumination[variant]

            red += (anchor.color[0] - red) * weight
            green += (anchor.color[1] - green) * weight
            blue += (anchor.color[2] - blue) * weight
          }

          const offset = (y * sampleWidth + x) * 4
          image.data[offset] = Math.min(255, Math.max(0, red))
          image.data[offset + 1] = Math.min(255, Math.max(0, green))
          image.data[offset + 2] = Math.min(255, Math.max(0, blue))
          image.data[offset + 3] = 255
        }
      }

      context.putImageData(image, 0, 0)
    }

    const observer = new ResizeObserver(render)
    observer.observe(canvas)
    render()
    return () => observer.disconnect()
  }, [variant])

  return <canvas ref={canvasRef} aria-hidden="true" style={canvasStyle} />
}
