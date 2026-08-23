#include <metal_stdlib>
using namespace metal;

// Calm drift field for the My Profile header card. The Inbox card gets the
// aurora; this is its quiet sibling: thin banks of mist drifting sideways,
// like haze over still water at dusk.
//
//  - Everything moves on glacial clocks. Nothing pulses fast enough to draw
//    the eye; calm is the whole point.
//  - A bank is horizontally stretched fBm, domain-warped so it reads as
//    soft vapour instead of stripes.
//  - Two sheets drift in opposite directions at different depths: parallax
//    without drama.
//  - The colours are the login mesh's anchors, muted: periwinkle and blue
//    carry the field, and a breath of pink passes through now and then.

struct DriftVertexOut {
    float4 position [[position]];
    float2 uv;
};

vertex DriftVertexOut drift_vertex(uint vid [[vertex_id]]) {
    float2 positions[] = {
        float2(-1, -1), float2(3, -1), float2(-1, 3)
    };
    DriftVertexOut out;
    out.position = float4(positions[vid], 0, 1);
    out.uv = positions[vid] * 0.5 + 0.5;
    out.uv.y = 1.0 - out.uv.y;
    return out;
}

constant float3 driftPeriwinkle = float3(82.0, 91.0, 169.0) / 255.0;
constant float3 driftBlue = float3(47.0, 83.0, 164.0) / 255.0;
constant float3 driftPink = float3(0.95, 0.36, 0.66);
constant float driftSaturation = 1.35;
constant float3 driftLuminanceWeights = float3(0.213, 0.715, 0.072);

/// The aurora's `saturate(1.3)` finish: pushes a tint away from its own grey.
static float3 drift_rich(float3 tint) {
    float luminance = dot(tint, driftLuminanceWeights);
    return clamp(luminance + (tint - luminance) * driftSaturation, 0.0, 1.0);
}

static float drift_hash(float2 p) {
    return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453);
}

static float drift_noise(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    float2 u = f * f * (3.0 - 2.0 * f);

    float a = drift_hash(i);
    float b = drift_hash(i + float2(1, 0));
    float c = drift_hash(i + float2(0, 1));
    float d = drift_hash(i + float2(1, 1));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

static float drift_fbm(float2 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 3; i += 1) {
        value += amplitude * drift_noise(p);
        p = p * 2.03 + 19.7;
        amplitude *= 0.5;
    }

    return value;
}

/// One sheet of mist. `scale` stretches the noise into horizontal banks,
/// `speed` sets the sideways drift, and `seed` keeps the sheets uncorrelated.
static float drift_bank(float2 uv, float time, float2 scale, float speed, float seed) {
    float2 p = float2(
        uv.x * scale.x + time * speed + seed,
        uv.y * scale.y - time * speed * 0.35
    );

    // Domain warp: bend the sample point with noise first, so the banks
    // billow instead of tiling.
    float warp = drift_fbm(p * 0.8 + 5.1);
    float density = drift_fbm(float2(p.x + 0.9 * warp, p.y + 0.4 * warp));

    return smoothstep(0.32, 0.86, density);
}

fragment float4 drift_fragment(
    DriftVertexOut in [[stage_in]],
    constant float &time [[buffer(0)]],
    constant float &lightMode [[buffer(1)]]
) {
    float2 uv = in.uv;

    // Far sheet: broad and dim, drifting left. Near sheet: tighter banks,
    // drifting right.
    float far = drift_bank(uv, time, float2(1.4, 3.2), -0.008, 3.0);
    float near = drift_bank(uv, time, float2(2.2, 4.6), 0.013, 11.0);

    // Mist hangs a little higher than it sinks: banks thin gently toward
    // the card's bottom edge, where the avatar sits.
    float altitude = 0.75 + 0.25 * (1.0 - uv.y);
    far *= altitude;
    near *= altitude;

    // The field breathes once every ~40 s, barely.
    float breathe = 0.90 + 0.10 * drift_noise(float2(time * 0.025, 4.2));
    far *= breathe;
    near *= breathe;

    // The near banks walk a slow blue -> periwinkle ramp, and a breath of
    // pink wanders through on its own clock.
    float3 nearTint = mix(
        driftBlue, driftPeriwinkle,
        drift_fbm(float2(uv.x * 1.7 + 2.2, uv.y * 2.0))
    );
    float pinkPass = drift_fbm(float2(uv.x * 1.1 + time * 0.006, 8.4));
    nearTint = mix(nearTint, driftPink, smoothstep(0.50, 0.88, pinkPass) * 0.55);
    nearTint = drift_rich(nearTint);

    if (lightMode > 0.5) {
        // A pastel wash over the page: a constant base gives the card its
        // body, and the sheets deepen it where they pass. Premultiplied.
        float3 premul = float3(0.0);
        float alpha = 0.0;

        float m0 = 0.20;
        premul = drift_rich(driftPeriwinkle) * m0 + premul * (1.0 - m0);
        alpha = m0 + alpha * (1.0 - m0);

        float m1 = far * 0.16;
        premul = drift_rich(driftBlue) * m1 + premul * (1.0 - m1);
        alpha = m1 + alpha * (1.0 - m1);

        float m2 = near * 0.26;
        premul = nearTint * m2 + premul * (1.0 - m2);
        alpha = m2 + alpha * (1.0 - m2);

        float m3 = near * near * 0.14;
        premul = (nearTint * 0.75) * m3 + premul * (1.0 - m3);
        alpha = m3 + alpha * (1.0 - m3);

        return float4(clamp(premul, 0.0, 1.0), clamp(alpha, 0.0, 1.0));
    }

    // Dark mode is added light over the dark page, with a faint constant
    // lift so the card's edge stays readable between the banks.
    float3 light = float3(0.0);
    light += driftBlue * 0.08;
    light += drift_rich(driftPeriwinkle) * (far * 0.26);
    light += nearTint * (near * 0.42);

    return float4(clamp(light, 0.0, 1.0), 0.0);
}
