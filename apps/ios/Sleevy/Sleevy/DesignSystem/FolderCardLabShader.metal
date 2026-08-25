#include <metal_stdlib>
using namespace metal;

// Experimental folder card fields, all in the Inbox aurora's language:
// strictly vertical (or deliberately transformed) rays, domain-warped fBm
// folds that clump into knots, one sharp border with a long fade, and added
// light over a near-black ground. A `variant` uniform picks the composition;
// the palette carries the folder's colour. Playground-only — the corona
// (style 6) won and lives on in FolderCardShader.metal; the rest stay here
// as the bench to iterate from.

struct FolderCardLabVertexOut {
    float4 position [[position]];
    float2 uv;
};

vertex FolderCardLabVertexOut folder_card_lab_vertex(uint vid [[vertex_id]]) {
    float2 positions[] = {
        float2(-1, -1), float2(3, -1), float2(-1, 3)
    };
    FolderCardLabVertexOut out;
    out.position = float4(positions[vid], 0, 1);
    out.uv = positions[vid] * 0.5 + 0.5;
    out.uv.y = 1.0 - out.uv.y;
    return out;
}

constant float3 fclLuminanceWeights = float3(0.213, 0.715, 0.072);

static float fcl_hash(float2 p) {
    return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453);
}

static float fcl_noise(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    float2 u = f * f * (3.0 - 2.0 * f);

    float a = fcl_hash(i);
    float b = fcl_hash(i + float2(1, 0));
    float c = fcl_hash(i + float2(0, 1));
    float d = fcl_hash(i + float2(1, 1));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

static float fcl_fbm(float2 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 3; i += 1) {
        value += amplitude * fcl_noise(p);
        p = p * 2.03 + 19.7;
        amplitude *= 0.5;
    }

    return value;
}

/// The aurora's `saturate(1.3)` finish.
static float3 fcl_rich(float3 tint) {
    float luminance = dot(tint, fclLuminanceWeights);
    return clamp(luminance + (tint - luminance) * 1.3, 0.0, 1.0);
}

/// The dark ground, faintly warmed by the palette.
static float3 fcl_ground(float2 uv, float3 deep) {
    float3 base = mix(float3(0.045, 0.045, 0.055), deep * 0.22, 0.40);
    return base * mix(0.88, 1.10, uv.y);
}

/// One folded curtain sheet, lifted from the Inbox aurora: border at uv.y=0,
/// long tails hanging down. Callers flip or rotate uv for other directions.
static float fcl_curtain(
    float2 uv,
    float time,
    float scale,
    float drift,
    float ripple,
    float fold,
    float tilt
) {
    float lean = tilt + 0.35 * (fcl_fbm(float2(uv.x * 1.4 + 9.2, time * 0.020)) - 0.44);
    float x = uv.x + uv.y * lean;

    float warp = fcl_fbm(float2(x * scale * 0.7 + time * ripple, uv.y * 0.5 + time * 0.050));
    float xw = x * scale + fold * warp + time * drift;

    float density = fcl_fbm(float2(xw, time * 0.045));
    float knots = smoothstep(0.28, 0.75, density);
    float wash = density * 0.18;

    float rayLength = 0.75 + 0.55 * fcl_fbm(float2(xw * 0.5 + 7.3, time * 0.030));
    float tail = 1.0 - clamp(uv.y / rayLength, 0.0, 1.0);
    float vertical = pow(tail, 1.6);
    vertical *= 1.0 - smoothstep(0.68, 0.94, uv.y);

    float breathe = 0.72 + 0.28 * fcl_noise(float2(xw * 0.35, time * 0.070));

    return (knots + wash) * vertical * breathe;
}

/// The palette's own blue->purple->pink walk: deep -> mid along the field,
/// leaning into the highlight where the noise runs hot.
static float3 fcl_tint(float2 uv, float time, float3 deep, float3 mid, float3 highlight) {
    float hueMix = fcl_fbm(float2(uv.x * 2.2 + 4.7, time * 0.012));
    float3 tint = mix(deep, mid, smoothstep(0.20, 0.58, hueMix));
    return mix(tint, highlight, smoothstep(0.62, 0.88, hueMix) * 0.45);
}

fragment float4 folder_card_lab_fragment(
    FolderCardLabVertexOut in [[stage_in]],
    constant float &time [[buffer(0)]],
    constant float &variant [[buffer(1)]],
    constant float3 &deep [[buffer(2)]],
    constant float3 &mid [[buffer(3)]],
    constant float3 &highlight [[buffer(4)]],
    constant float &shape [[buffer(5)]],
    constant float &aspect [[buffer(6)]]
) {
    float2 uv = in.uv;
    float t = time;
    int style = int(variant + 0.5);

    float3 col = fcl_ground(uv, deep);
    float3 tint = fcl_tint(uv, t, deep, mid, highlight);

    if (style == 0) {
        // Curtain: the Inbox card's direct sibling — two sheets hanging
        // from the top edge, wearing the folder's colour.
        float far = fcl_curtain(uv, t + 43.0, 3.2, -0.011, 0.038, 1.3, -0.07);
        float near = fcl_curtain(uv, t, 5.0, 0.019, 0.061, 1.9, 0.05);
        col += fcl_rich(mid) * far * 0.28;
        col += fcl_rich(tint) * near * 0.80;
        col += highlight * pow(near, 3.0) * 0.20;
    } else if (style == 1) {
        // Undercurtain: the same sheets rising from the bottom edge, so the
        // light pools behind the card's text instead of over the menu.
        float2 flipped = float2(uv.x, 1.0 - uv.y);
        float far = fcl_curtain(flipped, t + 61.0, 3.0, -0.010, 0.036, 1.2, 0.06);
        float near = fcl_curtain(flipped, t + 18.0, 4.6, 0.017, 0.055, 1.8, -0.04);
        col += fcl_rich(mid) * far * 0.24;
        col += fcl_rich(tint) * near * 0.70;
        col += highlight * pow(near, 3.0) * 0.16;
    } else if (style == 2) {
        // Horizon: one thin bright band lying low across the card, sharp on
        // its underside, a slow glow bleeding upward — an aurora seen far
        // away at the horizon.
        float level = mix(0.66, 0.78, shape)
            + 0.05 * (fcl_fbm(float2(uv.x * 2.6 + t * 0.015, 3.1)) - 0.5);
        float d = uv.y - level;
        float band = exp(-d * d / 0.0016);
        float clump = 0.45 + 0.55 * fcl_fbm(float2(uv.x * 5.0 + t * 0.02, 8.8));
        float skyGlow = exp(-max(0.0, -d) * 4.0) * step(d, 0.0);
        col += fcl_rich(mid) * skyGlow * 0.30;
        col += fcl_rich(tint) * band * clump * 0.95;
        col += highlight * band * clump * clump * 0.35;
    } else if (style == 3) {
        // Arc: a curved auroral bow across the upper half, knots strung
        // along it, tails hanging inward off its underside.
        float bow = mix(0.26, 0.40, shape) + 0.9 * pow(uv.x - 0.5, 2.0);
        float d = uv.y - bow;
        float band = exp(-d * d / 0.0035);
        float clump = smoothstep(0.30, 0.78, fcl_fbm(float2(uv.x * 4.2 + t * 0.02, 5.4)));
        float tails = exp(-max(0.0, d) * 5.5) * clump * step(0.0, d);
        col += fcl_rich(tint) * band * (0.35 + 0.65 * clump) * 0.85;
        col += fcl_rich(mid) * tails * 0.40;
        col += highlight * band * clump * 0.30;
    } else if (style == 4) {
        // Ribbon: one sinuous folded sheet crossing the card at a lean,
        // bright where the line of sight crosses its folds.
        float lean = mix(-0.35, -0.65, shape);
        float yr = uv.y + uv.x * lean + 0.25;
        float center = 0.42 + 0.16 * fcl_fbm(float2(uv.x * 2.4 + t * 0.02, 2.2));
        float d = yr - center;
        float body = exp(-d * d / 0.008);
        float folds = smoothstep(0.25, 0.75, fcl_fbm(float2(uv.x * 5.5 + t * 0.03, 9.6)));
        col += fcl_rich(tint) * body * (0.30 + 0.70 * folds) * 0.85;
        col += highlight * body * folds * folds * 0.30;
        col += fcl_rich(deep) * exp(-d * d / 0.05) * 0.25;
    } else if (style == 5) {
        // Picket: sparse, thin, distinct rays with their own heights — the
        // picket-fence aurora. More sky than light.
        float x = uv.x + uv.y * 0.04;
        float xw = x * mix(8.0, 11.0, shape) + 2.2 * fcl_fbm(float2(x * 3.0, t * 0.03));
        float density = fcl_fbm(float2(xw, t * 0.04));
        float rays = smoothstep(0.55, 0.82, density);
        float rayLength = 0.55 + 0.65 * fcl_fbm(float2(xw * 0.5 + 3.7, t * 0.02));
        float tail = pow(1.0 - clamp(uv.y / rayLength, 0.0, 1.0), 1.4);
        tail *= 1.0 - smoothstep(0.70, 0.95, uv.y);
        col += fcl_rich(tint) * rays * tail * 0.90;
        col += highlight * pow(rays * tail, 3.0) * 0.30;
        col += fcl_rich(mid) * density * tail * 0.10;
    } else if (style == 6) {
        // Corona: rays converging on a zenith just past the top-trailing
        // corner, the way an overhead aurora fans out. Distances are
        // corrected for the card's aspect (tuned at 2.2:1), so a slimmer
        // card keeps the same circular fan instead of stretched streaks.
        //
        // The ground is the Inbox header's true black; the fan alone defines
        // the card, reaching across most of it. Each folder's seed places
        // its own zenith — where along the top edge the light hangs, how far
        // above the card it sits, and how tightly its rays fan — so no two
        // folders' coronas originate from the same spot.
        col = float3(0.008, 0.008, 0.011);

        float zenithAlong = fcl_hash(float2(t * 0.13, 1.7));
        float zenithHeight = fcl_hash(float2(t * 0.29, 8.3));
        float rayFrequency = mix(4.5, 6.8, fcl_hash(float2(t * 0.41, 5.1)));
        float2 zenith = float2(
            mix(0.55, 1.08, mix(shape, zenithAlong, 0.65)),
            -mix(0.12, 0.45, zenithHeight)
        );

        float2 p = uv - zenith;
        p.x *= aspect / 2.2;
        float r = length(p);
        float angle = atan2(p.y, p.x);
        float density = fcl_fbm(float2(angle * rayFrequency + t * 0.02, r * 1.2 - t * 0.015));
        float rays = smoothstep(0.26, 0.72, density);
        float rayDetail = smoothstep(0.45, 0.85, fcl_fbm(float2(angle * 9.5 + 3.7, r * 1.6 + t * 0.01)));
        float reach = pow(clamp(1.0 - (r - 0.30) / 2.0, 0.0, 1.0), 1.7);
        float beam = rays * reach;

        col += fcl_rich(tint) * beam * 0.62;
        col += fcl_rich(mid) * (density * 0.5 + rayDetail * 0.5) * reach * 0.15;
        col += highlight * pow(beam, 3.0) * 0.16;
    } else if (style == 7) {
        // Veil: the dimmest field — a barely-there wash of warped light
        // over the whole card, all calm, no feature demanding the eye.
        float2 q = uv * mix(2.0, 2.8, shape);
        float warp = fcl_fbm(q + t * 0.01);
        float v = fcl_fbm(q + 1.6 * warp + float2(t * 0.008, 0.0));
        v *= fcl_fbm(uv * 1.3 + 5.2);
        col += fcl_rich(mix(deep, mid, v)) * v * 0.55;
        col += highlight * pow(v, 4.0) * 0.12;
    } else if (style == 8) {
        // Twin sheets: two curtains at opposite leans crossing each other,
        // one in the mid tint and one walking toward the highlight.
        float a = fcl_curtain(uv, t + 9.0, 4.2, 0.014, 0.050, 1.7, 0.38);
        float b = fcl_curtain(uv, t + 77.0, 3.6, -0.012, 0.042, 1.5, -0.42);
        col += fcl_rich(mid) * a * 0.55;
        col += fcl_rich(mix(mid, highlight, 0.45)) * b * 0.45;
        col += highlight * pow(a * b, 2.0) * 0.60;
    } else {
        // Reflection: a curtain over still water — the sheet hangs in the
        // top half, and a smeared, dimmer mirror of it sits below the
        // waterline. Made for the wide card.
        float waterline = mix(0.58, 0.66, shape);
        float2 sky = float2(uv.x, uv.y / waterline);
        float near = fcl_curtain(sky, t, 4.6, 0.018, 0.058, 1.8, 0.05);
        float far = fcl_curtain(sky, t + 43.0, 3.1, -0.011, 0.038, 1.3, -0.07);

        float2 mirrored = float2(
            uv.x + 0.03 * (fcl_fbm(float2(uv.x * 6.0, uv.y * 14.0 + t * 0.05)) - 0.5),
            (waterline * 2.0 - uv.y) / waterline
        );
        float gleam = fcl_curtain(mirrored, t, 4.6, 0.018, 0.058, 1.8, 0.05);
        float below = smoothstep(waterline, waterline + 0.04, uv.y);

        col *= 1.0 - below * 0.25;
        col += fcl_rich(mid) * far * (1.0 - below) * 0.26;
        col += fcl_rich(tint) * near * (1.0 - below) * 0.80;
        col += highlight * pow(near, 3.0) * (1.0 - below) * 0.20;
        col += fcl_rich(tint) * gleam * below * 0.28;
    }

    return float4(clamp(col, 0.0, 1.0), 1.0);
}
