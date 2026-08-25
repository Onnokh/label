// Web port of the iOS Inbox aurora (apps/ios/Sleevy/Sleevy/DesignSystem/AuroraShader.metal).
//
// The fragment function is translated line for line rather than reinterpreted:
// the same hash, the same three fBm octaves, the same two curtains, the same
// tints and the same two compositing paths. Only two things differ, and both
// are there because a browser column is not a phone card:
//
//  - `spread` keeps a ray the width the native tuning gives it when the card
//    is wider than the 2.5:1 the shader was tuned against.
//  - The renderer draws into the visible canvas instead of blitting through a
//    2D canvas the way the Folder card does. This field animates, so a still
//    snapshot has nothing to preserve.

export type AuroraFrame = {
  readonly time: number
  readonly theme: "light" | "dark"
  readonly width: number
  readonly height: number
}

/// The width-to-height ratio of the native header card: `ScreenLayout`
/// gives it `width * 0.40`.
const NATIVE_ASPECT = 2.5

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

uniform float time;
uniform float lightMode;
uniform float spread;

// The curtain tints are the login mesh's anchors, so the Inbox card and the
// sign-in screen read as one family.
const vec3 auroraBlue = vec3(47.0, 83.0, 164.0) / 255.0;
const vec3 auroraPurple = vec3(128.0, 57.0, 127.0) / 255.0;
const vec3 auroraMagenta = vec3(0.70, 0.17, 0.56);
const vec3 auroraPink = vec3(0.95, 0.36, 0.66);
const vec3 auroraPeriwinkle = vec3(82.0, 91.0, 169.0) / 255.0;
// The brightest knots stay light itself, not paint.
const vec3 auroraCore = vec3(0.88, 0.92, 1.00);

const float auroraSaturation = 1.3;
const vec3 auroraLuminanceWeights = vec3(0.213, 0.715, 0.072);

float aurora_hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float aurora_noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = aurora_hash(i);
  float b = aurora_hash(i + vec2(1.0, 0.0));
  float c = aurora_hash(i + vec2(0.0, 1.0));
  float d = aurora_hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float aurora_fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;

  for (int i = 0; i < 3; i += 1) {
    value += amplitude * aurora_noise(p);
    p = p * 2.03 + 19.7;
    amplitude *= 0.5;
  }

  return value;
}

// One folded curtain sheet. \`drift\` moves the whole sheet, \`ripple\` moves the
// folds along it, \`fold\` sets how hard the sheet is warped, and \`tilt\` leans
// the whole sheet off vertical.
float aurora_curtain(
  vec2 field,
  float clock,
  float scale,
  float drift,
  float ripple,
  float fold,
  float tilt
) {
  // Rays fan a little toward the magnetic zenith instead of hanging
  // ruler-straight: lean each column by its own slow noise.
  float lean = tilt + 0.35 * (aurora_fbm(vec2(field.x * 1.4 + 9.2, clock * 0.020)) - 0.44);
  float x = field.x + field.y * lean;

  // Domain warp: bend x with noise before the density is sampled, so the
  // sheet hangs in folds instead of even stripes.
  float warp = aurora_fbm(vec2(x * scale * 0.7 + clock * ripple, field.y * 0.5 + clock * 0.050));
  float xw = x * scale + fold * warp + clock * drift;

  // Brightness along the folded sheet is clumpy: knots where it folds, dim
  // gaps between them. The faint wash keeps a veil of light alive between the
  // knots, so the card never falls to black.
  float density = aurora_fbm(vec2(xw, clock * 0.045));
  float knots = smoothstep(0.28, 0.75, density);
  float wash = density * 0.18;

  // Each ray has its own length, spread wide on purpose, so the curtain's
  // lower edge is ragged instead of a shared fade line.
  float rayLength = 0.42 + 0.85 * aurora_fbm(vec2(xw * 0.5 + 7.3, clock * 0.030));

  // Full brightness at the top edge itself, then a long soft tail down.
  float tail = 1.0 - clamp(field.y / rayLength, 0.0, 1.0);
  float vertical = pow(tail, 1.6);

  // Hard floor: every ray is fully out before the card's bottom edge, so the
  // clip there can never cut a visible ray off.
  vertical *= 1.0 - smoothstep(0.68, 0.94, field.y);

  // Pulsating aurora: folds breathe on a slow clock of their own.
  float breathe = 0.72 + 0.28 * aurora_noise(vec2(xw * 0.35, clock * 0.070));

  return (knots + wash) * vertical * breathe;
}

void main() {
  // Only x is stretched. The rays keep the width the native tuning gives them
  // on a wide browser column, while the fall still spans the card's height.
  vec2 field = vec2((uv.x - 0.5) * spread + 0.5, uv.y);

  // Far sheet: dim, gentler folds, drifts and leans the other way.
  float far = aurora_curtain(field, time + 43.0, 3.2, -0.011, 0.038, 1.3, -0.07);

  // Near sheet: the main curtain.
  float near = aurora_curtain(field, time, 5.0, 0.019, 0.061, 1.9, 0.05);

  // Each stretch of curtain walks its own slow blue -> purple -> pink ramp,
  // and the tails sink into magenta while they still carry light.
  float hueMix = aurora_fbm(vec2(field.x * 2.2 + 4.7, time * 0.012));
  vec3 nearTint = mix(auroraBlue, auroraPurple, smoothstep(0.22, 0.55, hueMix));
  nearTint = mix(nearTint, auroraPink, smoothstep(0.55, 0.80, hueMix));
  nearTint = mix(nearTint, auroraMagenta, smoothstep(0.18, 0.70, uv.y) * 0.85);

  if (lightMode > 0.5) {
    // Curtains as source-over coverage: each sheet paints its tint over
    // whatever lies behind the layer, and the knots deepen toward the pure
    // tint instead of flaring white. Premultiplied.
    float tintLuminance = dot(nearTint, auroraLuminanceWeights);
    vec3 richTint = clamp(
      vec3(tintLuminance) + (nearTint - tintLuminance) * auroraSaturation,
      0.0,
      1.0
    );

    vec3 premul = vec3(0.0);
    float alpha = 0.0;

    float m1 = far * 0.38;
    premul = auroraPeriwinkle * m1 + premul * (1.0 - m1);
    alpha = m1 + alpha * (1.0 - m1);

    float m2 = near * 0.72;
    premul = richTint * m2 + premul * (1.0 - m2);
    alpha = m2 + alpha * (1.0 - m2);

    float m3 = pow(near, 3.0) * 0.45;
    premul = (richTint * 0.65) * m3 + premul * (1.0 - m3);
    alpha = m3 + alpha * (1.0 - m3);

    fragmentColor = vec4(clamp(premul, 0.0, 1.0), clamp(alpha, 0.0, 1.0));
    return;
  }

  // Dark mode is added light. The native shader returns it with alpha zero and
  // lets Core Animation add it to the layer below. A browser cannot be asked
  // for that: WebGL calls a premultiplied colour above its own alpha
  // undefined, and Chromium duly composites those pixels as nothing at all.
  //
  // So the same light is emitted as honest coverage instead: alpha is the
  // brightest channel, which is the smallest alpha the colour is still legal
  // under. Source-over then gives \`light + page * (1 - alpha)\` where adding
  // gives \`light + page\`. The page behind the card is near-black, so the
  // difference is a couple of levels of grey and no ridge can appear.
  vec3 light = vec3(0.0);
  light += auroraPeriwinkle * (far * 0.45);
  light += nearTint * (near * 1.05);
  light += auroraCore * pow(near, 3.0) * 0.25;

  // Stands in for the login mesh's CSS \`saturate(1.3)\`.
  float luminance = dot(light, auroraLuminanceWeights);
  light = clamp(vec3(luminance) + (light - luminance) * auroraSaturation, 0.0, 1.0);

  fragmentColor = vec4(light, max(max(light.r, light.g), light.b));
}
`

type Uniforms = {
  readonly time: WebGLUniformLocation
  readonly lightMode: WebGLUniformLocation
  readonly spread: WebGLUniformLocation
}

export class AuroraRenderer {
  private program: WebGLProgram | null = null
  private uniforms: Uniforms | null = null

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gl: WebGL2RenderingContext,
    private readonly onRestored: () => void,
  ) {
    canvas.addEventListener("webglcontextlost", this.handleContextLost)
    canvas.addEventListener("webglcontextrestored", this.handleContextRestored)
    this.compile()
  }

  static create(canvas: HTMLCanvasElement, onRestored: () => void): AuroraRenderer | null {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      // The card spends most of its life paused — off screen, in a background
      // tab, or under Reduce Motion — and a paused canvas draws nothing. Left
      // unpreserved the drawing buffer is cleared once it has been composited,
      // so that last still frame would vanish and leave an empty card.
      preserveDrawingBuffer: true,
      powerPreference: "low-power",
    })
    return gl ? new AuroraRenderer(canvas, gl, onRestored) : null
  }

  render(frame: AuroraFrame): boolean {
    if (!this.program || !this.uniforms) return false

    const { canvas, gl } = this
    if (canvas.width !== frame.width) canvas.width = frame.width
    if (canvas.height !== frame.height) canvas.height = frame.height

    gl.viewport(0, 0, frame.width, frame.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.program)
    gl.uniform1f(this.uniforms.time, frame.time)
    gl.uniform1f(this.uniforms.lightMode, frame.theme === "light" ? 1 : 0)
    gl.uniform1f(this.uniforms.spread, frame.width / Math.max(frame.height, 1) / NATIVE_ASPECT)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    // No `getError` here on purpose: this runs every frame, and the call
    // forces a synchronous flush of the pipeline. A compile or link failure
    // has already cleared `program`, which is the case worth reporting.
    return true
  }

  dispose() {
    const { canvas, gl } = this
    canvas.removeEventListener("webglcontextlost", this.handleContextLost)
    canvas.removeEventListener("webglcontextrestored", this.handleContextRestored)
    if (this.program) gl.deleteProgram(this.program)
    this.program = null
    this.uniforms = null
    // Deliberately no `WEBGL_lose_context.loseContext()` here. A canvas hands
    // out one context for its whole life, so losing it poisons the element
    // rather than the renderer: the next `getContext` returns that same dead
    // context, every shader then fails to compile with a null info log, and
    // the card stays blank until the page is reloaded. The effect re-runs on
    // every theme change and on every hot reload, so that is not a rare path.
    // Dropping the reference is enough — the context dies with the canvas.
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
      reportShaderError(gl.getProgramInfoLog(program) ?? "Could not link the aurora shader.")
      gl.deleteProgram(program)
      return
    }

    const uniforms = {
      time: gl.getUniformLocation(program, "time"),
      lightMode: gl.getUniformLocation(program, "lightMode"),
      spread: gl.getUniformLocation(program, "spread"),
    }
    if (Object.values(uniforms).some((location) => location === null)) {
      reportShaderError("The aurora shader is missing a uniform.")
      gl.deleteProgram(program)
      return
    }

    this.program = program
    this.uniforms = uniforms as Uniforms
  }

  private readonly handleContextLost = (event: Event) => {
    event.preventDefault()
    this.program = null
    this.uniforms = null
  }

  private readonly handleContextRestored = () => {
    this.compile()
    if (this.program) this.onRestored()
  }
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader

  reportShaderError(gl.getShaderInfoLog(shader) ?? "Could not compile the aurora shader.")
  gl.deleteShader(shader)
  return null
}

function reportShaderError(message: string) {
  if (import.meta.env.DEV) console.error(`[aurora-shader] ${message}`)
}
