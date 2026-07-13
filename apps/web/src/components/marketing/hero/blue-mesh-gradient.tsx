import { useEffect, useRef } from "react"

const definitions = {
  // Geometry from the mesh-gradient handoff, recoloured with Sleevy's original
  // indigo and wine-magenta palette.
  hero: {
    base: [10, 11, 18],
    anchors: [
      { x: 0.19, y: 0.32, color: [36, 55, 113], reach: 0.76, radius: 0.52 },
      { x: 0.84, y: 0.14, color: [116, 41, 103], reach: 0.52, radius: 0.72 },
      { x: 0.06, y: 0.94, color: [96, 14, 68], reach: 0.78, radius: 0.4 },
      { x: 0.55, y: 0.68, color: [76, 55, 126], reach: 0.98, radius: 0.62 },
    ],
  },
  share: {
    base: [17, 14, 24],
    anchors: [
      { x: 0.1, y: 0.2, color: [52, 61, 130], reach: 0.62, radius: 0.48 },
      { x: 0.88, y: 0.34, color: [124, 49, 105], reach: 0.68, radius: 0.64 },
      { x: 0.24, y: 0.94, color: [96, 14, 68], reach: 0.68, radius: 0.42 },
      { x: 0.56, y: 0.66, color: [89, 61, 145], reach: 0.82, radius: 0.58 },
    ],
  },
  workflow: {
    base: [15, 12, 22],
    anchors: [
      { x: 0.24, y: 0.16, color: [46, 45, 112], reach: 0.6, radius: 0.52 },
      { x: 0.78, y: 0.2, color: [132, 59, 118], reach: 0.56, radius: 0.7 },
      { x: 0.08, y: 0.78, color: [78, 20, 79], reach: 0.72, radius: 0.44 },
      { x: 0.62, y: 0.74, color: [104, 46, 111], reach: 0.9, radius: 0.6 },
    ],
  },
} as const

const falloff = 1.75
// Keep the field present but comfortably behind the product imagery and copy.
const illumination = 0.38

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
            const weight = Math.exp((-falloff * distanceSquared) / spread) * illumination

            red += (anchor.color[0] - red) * weight
            green += (anchor.color[1] - green) * weight
            blue += (anchor.color[2] - blue) * weight
          }

          const offset = (y * sampleWidth + x) * 4
          image.data[offset] = red
          image.data[offset + 1] = green
          image.data[offset + 2] = blue
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
