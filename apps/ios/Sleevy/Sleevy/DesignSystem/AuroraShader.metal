#include <metal_stdlib>
using namespace metal;

// Aurora field for the Inbox header card. Unlike GradientShader.metal this one
// animates, so the fragment takes a time uniform.
//
// The construction follows how a real aurora is built:
//  - Light is emitted along magnetic field lines, so the rays stay strictly
//    vertical. Only their position and brightness along x are random.
//  - A curtain is one thin folded sheet. Where the line of sight crosses a
//    fold, it reads as a bright knot. Domain-warped fBm makes those folds,
//    which is what breaks the repetition a plain sine has.
//  - The lower border of a real curtain is its sharpest feature and the light
//    fades slowly up the rays. The card's top edge plays that border, with
//    the long fade hanging down.
//  - Calm comes from three uncoupled clocks: a slow drift of the whole field,
//    faster ripples along the curtain, and folds that breathe on their own.
//  - A dim aurora is grey-white to the naked eye, so one colour is honest.

struct AuroraVertexOut {
    float4 position [[position]];
    float2 uv;
};

vertex AuroraVertexOut aurora_vertex(uint vid [[vertex_id]]) {
    float2 positions[] = {
        float2(-1, -1), float2(3, -1), float2(-1, 3)
    };
    AuroraVertexOut out;
    out.position = float4(positions[vid], 0, 1);
    out.uv = positions[vid] * 0.5 + 0.5;
    out.uv.y = 1.0 - out.uv.y;
    return out;
}

// The curtain tints are the login mesh's anchors (GradientShader.metal), so
// the Inbox card and the sign-in screen read as one family.
//
// There is no base colour: the field renders with premultiplied alpha over a
// transparent layer, so only the aurora itself shows and the backdrop IS the
// list background. A ridge at the card's edge is impossible by construction.
constant float3 auroraBlue = float3(47.0, 83.0, 164.0) / 255.0;
constant float3 auroraPurple = float3(128.0, 57.0, 127.0) / 255.0;
// The mesh's magenta anchor, lifted ~1.7x: at anchor strength it would sink
// into the tail fade and never read.
constant float3 auroraMagenta = float3(0.70, 0.17, 0.56);
// The brand pink the login bokeh tags carry.
constant float3 auroraPink = float3(0.95, 0.36, 0.66);
constant float3 auroraPeriwinkle = float3(82.0, 91.0, 169.0) / 255.0;

// The brightest knots stay light itself, not paint.
constant float3 auroraCore = float3(0.88, 0.92, 1.00);


constant float auroraSaturation = 1.3;
constant float3 auroraLuminanceWeights = float3(0.213, 0.715, 0.072);

static float aurora_hash(float2 p) {
    return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453);
}

static float aurora_noise(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    float2 u = f * f * (3.0 - 2.0 * f);

    float a = aurora_hash(i);
    float b = aurora_hash(i + float2(1, 0));
    float c = aurora_hash(i + float2(0, 1));
    float d = aurora_hash(i + float2(1, 1));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

static float aurora_fbm(float2 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 3; i += 1) {
        value += amplitude * aurora_noise(p);
        p = p * 2.03 + 19.7;
        amplitude *= 0.5;
    }

    return value;
}

/// One folded curtain sheet. `drift` moves the whole sheet, `ripple` moves the
/// folds along it, `fold` sets how hard the sheet is warped, and `tilt` leans
/// the whole sheet off vertical.
static float aurora_curtain(
    float2 uv,
    float time,
    float scale,
    float drift,
    float ripple,
    float fold,
    float tilt
) {
    // Rays fan a little toward the magnetic zenith instead of hanging
    // ruler-straight: lean each column by its own slow noise.
    float lean = tilt + 0.35 * (aurora_fbm(float2(uv.x * 1.4 + 9.2, time * 0.020)) - 0.44);
    float x = uv.x + uv.y * lean;

    // Domain warp: bend x with noise before the density is sampled, so the
    // sheet hangs in folds instead of even stripes. The warp also varies
    // down the height, so a ray curves gently along its length.
    float warp = aurora_fbm(float2(x * scale * 0.7 + time * ripple, uv.y * 0.5 + time * 0.050));
    float xw = x * scale + fold * warp + time * drift;

    // Brightness along the folded sheet is clumpy: knots where it folds,
    // dim gaps between them. Nothing periodic. The faint wash keeps a veil
    // of light alive between the knots, so the card never falls to black.
    float density = aurora_fbm(float2(xw, time * 0.045));
    float knots = smoothstep(0.28, 0.75, density);
    float wash = density * 0.18;

    // Each ray has its own length.
    float rayLength = 0.75 + 0.55 * aurora_fbm(float2(xw * 0.5 + 7.3, time * 0.030));

    // Full brightness at the top edge itself, then a long soft tail down.
    float tail = 1.0 - clamp(uv.y / rayLength, 0.0, 1.0);
    float vertical = pow(tail, 1.6);

    // Hard floor: every ray is fully out before the card's bottom edge, so
    // the clip there can never cut a visible ray off.
    vertical *= 1.0 - smoothstep(0.68, 0.94, uv.y);

    // Pulsating aurora: folds breathe on a slow clock of their own.
    float breathe = 0.72 + 0.28 * aurora_noise(float2(xw * 0.35, time * 0.070));

    return (knots + wash) * vertical * breathe;
}

fragment float4 aurora_fragment(
    AuroraVertexOut in [[stage_in]],
    constant float &time [[buffer(0)]],
    constant float &lightMode [[buffer(1)]]
) {
    float2 uv = in.uv;

    // Far sheet: dim, gentler folds, drifts and leans the other way.
    float far = aurora_curtain(uv, time + 43.0, 3.2, -0.011, 0.038, 1.3, -0.07);

    // Near sheet: the main curtain.
    float near = aurora_curtain(uv, time, 5.0, 0.019, 0.061, 1.9, 0.05);

    // Each stretch of curtain walks its own slow blue -> purple -> pink ramp,
    // and the tails sink into magenta while they still carry light.
    float hueMix = aurora_fbm(float2(uv.x * 2.2 + 4.7, time * 0.012));
    float3 nearTint = mix(auroraBlue, auroraPurple, smoothstep(0.22, 0.55, hueMix));
    nearTint = mix(nearTint, auroraPink, smoothstep(0.55, 0.80, hueMix));
    nearTint = mix(nearTint, auroraMagenta, smoothstep(0.18, 0.70, uv.y) * 0.85);

    if (lightMode > 0.5) {
        // Curtains as source-over coverage: each sheet paints its tint over
        // whatever lies behind the layer, and the knots deepen toward the
        // pure tint instead of flaring white. Premultiplied. The tints get
        // the same saturation finish the dark path has, or the field reads
        // as milk on white.
        float tintLuminance = dot(nearTint, auroraLuminanceWeights);
        float3 richTint = clamp(
            tintLuminance + (nearTint - tintLuminance) * auroraSaturation,
            0.0, 1.0
        );

        float3 premul = float3(0.0);
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

        return float4(clamp(premul, 0.0, 1.0), clamp(alpha, 0.0, 1.0));
    }

    // Dark mode is pure added light: alpha stays zero so the layer only
    // brightens what lies behind it.
    float3 light = float3(0.0);
    light += auroraPeriwinkle * (far * 0.45);
    light += nearTint * (near * 1.05);
    light += auroraCore * pow(near, 3.0) * 0.25;

    // Stands in for the login mesh's CSS `saturate(1.3)`.
    float luminance = dot(light, auroraLuminanceWeights);
    light = clamp(luminance + (light - luminance) * auroraSaturation, 0.0, 1.0);

    return float4(light, 0.0);
}
