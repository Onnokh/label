type Color = readonly [number, number, number]

export type FolderCardPalette = {
  readonly deep: Color
  readonly mid: Color
  readonly highlight: Color
}

export const folderCardColorOptions = [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
  "neutral",
] as const

export type FolderCardColor = (typeof folderCardColorOptions)[number]

const palettes = {
  red: { deep: [0.30, 0.07, 0.09], mid: [0.82, 0.34, 0.20], highlight: [1.0, 0.74, 0.46] },
  orange: { deep: [0.32, 0.15, 0.05], mid: [0.86, 0.52, 0.24], highlight: [1.0, 0.86, 0.58] },
  yellow: { deep: [0.30, 0.23, 0.07], mid: [0.84, 0.68, 0.32], highlight: [1.0, 0.94, 0.68] },
  green: { deep: [0.05, 0.24, 0.15], mid: [0.34, 0.68, 0.48], highlight: [0.68, 0.94, 0.78] },
  teal: { deep: [0.03, 0.20, 0.24], mid: [0.24, 0.58, 0.62], highlight: [0.62, 0.88, 0.92] },
  blue: { deep: [0.07, 0.11, 0.30], mid: [0.32, 0.46, 0.84], highlight: [0.70, 0.74, 0.98] },
  purple: { deep: [0.20, 0.09, 0.36], mid: [0.58, 0.42, 0.86], highlight: [0.92, 0.70, 0.90] },
  pink: { deep: [0.30, 0.08, 0.18], mid: [0.82, 0.40, 0.56], highlight: [1.0, 0.78, 0.82] },
  neutral: { deep: [0.16, 0.18, 0.23], mid: [0.52, 0.57, 0.67], highlight: [0.88, 0.91, 0.97] },
} as const satisfies Record<string, FolderCardPalette>

function folderCardColorKey(color: string | null | undefined): keyof typeof palettes {
  return color && color in palettes ? color as keyof typeof palettes : "neutral"
}

export function folderCardPalette(color: string | null | undefined): FolderCardPalette {
  return palettes[folderCardColorKey(color)]
}

export function folderCardSeed(identity: string): number {
  let hash = 5
  for (const scalar of identity) {
    hash = ((Math.imul(hash, 31) + (scalar.codePointAt(0) ?? 0)) >>> 0) % 997
  }
  return hash
}

export function folderCardShape(identity: string): number {
  let hash = 7
  for (const scalar of identity) {
    hash = ((Math.imul(hash, 17) + (scalar.codePointAt(0) ?? 0)) >>> 0) % 101
  }
  return hash / 100
}

export function folderCardField(identity: string, color: string | null | undefined) {
  // Keep the corona stable for a folder, but let its chosen palette produce a
  // distinct composition. Changing a folder from blue to purple should not
  // leave the same zenith and ray rhythm behind a different color.
  const fieldIdentity = `${folderCardColorKey(color)}:${identity}`

  return {
    palette: folderCardPalette(color),
    seed: folderCardSeed(fieldIdentity),
    shape: folderCardShape(fieldIdentity),
  }
}

type RenderOptions = {
  readonly id: string
  readonly color: string | null
  readonly theme: "light" | "dark"
  readonly cssWidth: number
  readonly cssHeight: number
}

type Uniforms = {
  readonly seed: WebGLUniformLocation
  readonly shape: WebGLUniformLocation
  readonly deep: WebGLUniformLocation
  readonly mid: WebGLUniformLocation
  readonly highlight: WebGLUniformLocation
  readonly aspect: WebGLUniformLocation
  readonly lightMode: WebGLUniformLocation
}

const vertexShaderSource = `#version 300 es
precision highp float;

out vec2 uv;

void main() {
  vec2 positions[3] = vec2[](
    vec2(-1.0, -1.0),
    vec2(3.0, -1.0),
    vec2(-1.0, 3.0)
  );
  vec2 position = positions[gl_VertexID];
  gl_Position = vec4(position, 0.0, 1.0);
  uv = position * 0.5 + 0.5;
  uv.y = 1.0 - uv.y;
}
`

const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 uv;
out vec4 fragmentColor;

uniform float seed;
uniform float shape;
uniform vec3 deep;
uniform vec3 mid;
uniform vec3 highlight;
uniform float aspect;
uniform float lightMode;

const vec3 luminanceWeights = vec3(0.213, 0.715, 0.072);

float fcard_hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

float fcard_noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 fraction = fract(point);
  vec2 curve = fraction * fraction * (3.0 - 2.0 * fraction);

  float a = fcard_hash(cell);
  float b = fcard_hash(cell + vec2(1.0, 0.0));
  float c = fcard_hash(cell + vec2(0.0, 1.0));
  float d = fcard_hash(cell + vec2(1.0, 1.0));

  return mix(mix(a, b, curve.x), mix(c, d, curve.x), curve.y);
}

float fcard_fbm(vec2 point) {
  float value = 0.0;
  float amplitude = 0.5;

  for (int octave = 0; octave < 3; octave += 1) {
    value += amplitude * fcard_noise(point);
    point = point * 2.03 + 19.7;
    amplitude *= 0.5;
  }

  return value;
}

vec3 fcard_rich(vec3 tint) {
  float luminance = dot(tint, luminanceWeights);
  return clamp(luminance + (tint - luminance) * 1.08, 0.0, 1.0);
}

void fcard_over(vec3 ink, float coverage, inout vec3 premul, inout float alpha) {
  float mask = clamp(coverage, 0.0, 1.0);
  premul = ink * mask + premul * (1.0 - mask);
  alpha = mask + alpha * (1.0 - mask);
}

vec3 fcard_tint(vec2 point) {
  float hueMix = fcard_fbm(vec2(point.x * 2.2 + 4.7, seed * 0.012));
  vec3 tint = mix(deep, mid, smoothstep(0.20, 0.58, hueMix));
  return mix(tint, highlight, smoothstep(0.55, 0.85, hueMix) * 0.60);
}

void main() {
  vec3 tint = fcard_tint(uv);
  float zenithAlong = fcard_hash(vec2(seed * 0.13, 1.7));
  float zenithHeight = fcard_hash(vec2(seed * 0.29, 8.3));
  float rayFrequency = mix(4.5, 6.8, fcard_hash(vec2(seed * 0.41, 5.1)));
  vec2 zenith = vec2(
    mix(0.55, 1.08, mix(shape, zenithAlong, 0.65)),
    -mix(0.12, 0.45, zenithHeight)
  );

  vec2 point = uv - zenith;
  point.x *= aspect / 2.2;
  float radius = length(point);
  float angle = atan(point.y, point.x);
  float density = fcard_fbm(vec2(angle * rayFrequency, radius * 1.2));
  float rays = smoothstep(0.26, 0.72, density);
  float rayDetail = smoothstep(0.45, 0.85, fcard_fbm(vec2(angle * 9.5 + 3.7, radius * 1.6)));
  float reach = pow(clamp(1.0 - (radius - 0.30) / 2.0, 0.0, 1.0), 1.7);
  float beam = rays * reach;

  if (lightMode > 0.5) {
    // A light page cannot be lit, only tinted. So where the dark card adds
    // light to darkness, this one lays colour on paper: a soft wash over the
    // whole card, rays in the palette's mid tone, and the deepest tone kept
    // for the zenith. Reaching wider than the dark card stops the far end of
    // the card from fading out to blank white.
    float wide = pow(clamp(1.0 - (radius - 0.30) / 2.6, 0.0, 1.0), 1.1);
    float beamWide = rays * wide;
    float wash = (density * 0.5 + rayDetail * 0.5) * reach;

    vec3 premul = vec3(0.0);
    float alpha = 0.0;
    fcard_over(fcard_rich(mix(highlight, mid, 0.35)), 0.22, premul, alpha);
    fcard_over(fcard_rich(mix(tint, mid, 0.50)), beamWide * 0.70, premul, alpha);
    fcard_over(fcard_rich(mid), wash * 0.40, premul, alpha);
    fcard_over(fcard_rich(mix(deep, mid, 0.40)), pow(beam, 2.4) * 0.50, premul, alpha);
    fragmentColor = vec4(clamp(premul, 0.0, 1.0), clamp(alpha, 0.0, 1.0));
    return;
  }

  // The card carries no fill of its own: the Corona is composed over
  // transparency so the page behind the card shows through.
  vec3 premul = vec3(0.0);
  float alpha = 0.0;
  fcard_over(fcard_rich(tint), beam * 0.62, premul, alpha);
  fcard_over(fcard_rich(mid), (density * 0.5 + rayDetail * 0.5) * reach * 0.15, premul, alpha);
  fcard_over(highlight, pow(beam, 3.0) * 0.16, premul, alpha);
  fragmentColor = vec4(clamp(premul, 0.0, 1.0), clamp(alpha, 0.0, 1.0));
}
`

const restoredListeners = new Set<() => void>()

class FolderCardRenderer {
  private program: WebGLProgram | null = null
  private uniforms: Uniforms | null = null

  private constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly gl: WebGL2RenderingContext,
  ) {
    this.canvas.addEventListener("webglcontextlost", this.onContextLost)
    this.canvas.addEventListener("webglcontextrestored", this.onContextRestored)
    this.compile()
  }

  static create(): FolderCardRenderer | null {
    const canvas = document.createElement("canvas")
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "low-power",
    })
    return gl ? new FolderCardRenderer(canvas, gl) : null
  }

  render(width: number, height: number, options: RenderOptions): boolean {
    if (!this.program || !this.uniforms) return false

    const { gl } = this
    const field = folderCardField(options.id, options.color)
    if (this.canvas.width !== width) this.canvas.width = width
    if (this.canvas.height !== height) this.canvas.height = height

    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.program)
    gl.uniform1f(this.uniforms.seed, field.seed)
    gl.uniform1f(this.uniforms.shape, field.shape)
    gl.uniform3fv(this.uniforms.deep, field.palette.deep)
    gl.uniform3fv(this.uniforms.mid, field.palette.mid)
    gl.uniform3fv(this.uniforms.highlight, field.palette.highlight)
    gl.uniform1f(this.uniforms.aspect, width / Math.max(height, 1))
    gl.uniform1f(this.uniforms.lightMode, options.theme === "light" ? 1 : 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    return gl.getError() === gl.NO_ERROR
  }

  private compile() {
    const { gl } = this
    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource)
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)
    if (!vertex || !fragment) return

    const program = gl.createProgram()
    if (!program) return
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      reportShaderError(gl.getProgramInfoLog(program) ?? "Could not link Folder card shader.")
      gl.deleteProgram(program)
      return
    }

    const uniform = (name: string) => gl.getUniformLocation(program, name)
    const uniforms = {
      seed: uniform("seed"),
      shape: uniform("shape"),
      deep: uniform("deep"),
      mid: uniform("mid"),
      highlight: uniform("highlight"),
      aspect: uniform("aspect"),
      lightMode: uniform("lightMode"),
    }
    if (Object.values(uniforms).some((location) => location === null)) {
      reportShaderError("Folder card shader is missing a uniform.")
      gl.deleteProgram(program)
      return
    }

    this.program = program
    this.uniforms = uniforms as Uniforms
  }

  private readonly onContextLost = (event: Event) => {
    event.preventDefault()
    this.program = null
    this.uniforms = null
  }

  private readonly onContextRestored = () => {
    this.compile()
    if (this.program) restoredListeners.forEach((redraw) => redraw())
  }
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader

  reportShaderError(gl.getShaderInfoLog(shader) ?? "Could not compile Folder card shader.")
  gl.deleteShader(shader)
  return null
}

function reportShaderError(message: string) {
  if (import.meta.env.DEV) console.error(`[folder-card-shader] ${message}`)
}

let sharedRenderer: FolderCardRenderer | null | undefined

function renderer(): FolderCardRenderer | null {
  if (sharedRenderer !== undefined) return sharedRenderer
  sharedRenderer = typeof document === "undefined" ? null : FolderCardRenderer.create()
  return sharedRenderer
}

export function renderFolderCard(target: HTMLCanvasElement, options: RenderOptions): boolean {
  const source = renderer()
  if (!source || options.cssWidth <= 0 || options.cssHeight <= 0) return false

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  const width = Math.max(1, Math.round(options.cssWidth * pixelRatio))
  const height = Math.max(1, Math.round(options.cssHeight * pixelRatio))
  if (!source.render(width, height, options)) return false

  if (target.width !== width) target.width = width
  if (target.height !== height) target.height = height
  const context = target.getContext("2d")
  if (!context) return false
  context.clearRect(0, 0, width, height)
  context.drawImage(source.canvas, 0, 0, width, height)
  return true
}

export function onFolderCardShaderRestored(redraw: () => void): () => void {
  restoredListeners.add(redraw)
  return () => restoredListeners.delete(redraw)
}
