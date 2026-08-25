#include <metal_stdlib>
using namespace metal;

// The folder card fields, in the Inbox aurora's language (domain-warped
// fBm knots, added light over a near-black ground, the same — but gentler —
// saturation finish), so every card reads as a sibling of the aurora.
//
// Two compositions ship, picked by the `style` uniform from the wider
// playground of styles (FolderCardLabShader.metal):
//  - corona (0): rays converging on a zenith hanging past the top edge,
//    the way an overhead aurora fans out. Worn by the folder cards.
//  - arc (1): a curved auroral bow across the upper half, knots strung
//    along it, tails hanging off its underside. Worn by the profile hero.
//
// Folder cards render static — one frozen moment of the field per folder,
// chosen by a seed — so a whole stack costs one draw per card and nothing
// at rest. A lone header card may animate through the `motion` uniform.

struct FolderCardVertexOut {
    float4 position [[position]];
    float2 uv;
};

vertex FolderCardVertexOut folder_card_vertex(uint vid [[vertex_id]]) {
    float2 positions[] = {
        float2(-1, -1), float2(3, -1), float2(-1, 3)
    };
    FolderCardVertexOut out;
    out.position = float4(positions[vid], 0, 1);
    out.uv = positions[vid] * 0.5 + 0.5;
    out.uv.y = 1.0 - out.uv.y;
    return out;
}

static float fcard_hash(float2 p) {
    return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453);
}

static float fcard_noise(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    float2 u = f * f * (3.0 - 2.0 * f);

    float a = fcard_hash(i);
    float b = fcard_hash(i + float2(1, 0));
    float c = fcard_hash(i + float2(0, 1));
    float d = fcard_hash(i + float2(1, 1));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

static float fcard_fbm(float2 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 3; i += 1) {
        value += amplitude * fcard_noise(p);
        p = p * 2.03 + 19.7;
        amplitude *= 0.5;
    }

    return value;
}

constant float3 fcardLuminanceWeights = float3(0.213, 0.715, 0.072);

/// A gentler cousin of the aurora's `saturate(1.3)` finish. The folder
/// palettes span two neighbouring hues instead of one; pushed at the
/// aurora's full strength they turned harsh next to its pastel calm, so
/// the corona barely leaves its own grey.
static float3 fcard_rich(float3 tint) {
    float luminance = dot(tint, fcardLuminanceWeights);
    return clamp(luminance + (tint - luminance) * 1.08, 0.0, 1.0);
}

/// The palette's own walk along the field: deep -> mid, leaning into the
/// highlight where the noise runs hot. The highlight sits a hue over from
/// the mid (red's is amber, purple's is pink), so the walk is what turns
/// one folder colour into a scheme.
static float3 fcard_tint(float2 uv, float time, float3 deep, float3 mid, float3 highlight) {
    float hueMix = fcard_fbm(float2(uv.x * 2.2 + 4.7, time * 0.012));
    float3 tint = mix(deep, mid, smoothstep(0.20, 0.58, hueMix));
    return mix(tint, highlight, smoothstep(0.55, 0.85, hueMix) * 0.60);
}

fragment float4 folder_card_fragment(
    FolderCardVertexOut in [[stage_in]],
    constant float &time [[buffer(0)]],
    constant float &shape [[buffer(1)]],
    constant float3 &deep [[buffer(2)]],
    constant float3 &mid [[buffer(3)]],
    constant float3 &highlight [[buffer(4)]],
    constant float &aspect [[buffer(5)]],
    constant float &motion [[buffer(6)]],
    constant float &style [[buffer(7)]],
    constant float &bottomFade [[buffer(8)]]
) {
    float2 uv = in.uv;
    // `time` is the card's frozen seed and places the composition; it
    // must never advance, or the corona's zenith hashes would teleport
    // the fan every frame. `motion` is a real clock (zero on static
    // cards) that only drifts the light through the fixed composition,
    // the same slow breathing as the Inbox aurora.
    float t = time;
    float ta = t + motion;

    float3 tint = fcard_tint(uv, ta, deep, mid, highlight);
    float3 col;

    if (int(style + 0.5) == 1) {
        // Arc: a curved auroral bow across the upper half, knots strung
        // along it, tails hanging inward off its underside, over the
        // palette-warmed near-black ground.
        col = mix(float3(0.045, 0.045, 0.055), deep * 0.22, 0.40)
            * mix(0.88, 1.10, uv.y);

        float bow = mix(0.26, 0.40, shape) + 0.9 * pow(uv.x - 0.5, 2.0);
        float d = uv.y - bow;
        float band = exp(-d * d / 0.0035);
        float clump = smoothstep(0.30, 0.78, fcard_fbm(float2(uv.x * 4.2 + ta * 0.02, 5.4)));
        float tails = exp(-max(0.0, d) * 5.5) * clump * step(0.0, d);

        col += fcard_rich(tint) * band * (0.35 + 0.65 * clump) * 0.85;
        col += fcard_rich(mid) * tails * 0.40;
        col += highlight * band * clump * 0.30;

        return float4(clamp(col, 0.0, 1.0), 1.0);
    }

    // Corona. The ground is the Inbox header's true black; the fan alone
    // defines the card, reaching across most of it. Each folder's seed
    // places its own zenith — where along the top edge the light hangs,
    // how far above the card it sits, and how tightly its rays fan — so
    // no two folders' coronas originate from the same spot.
    col = float3(0.008, 0.008, 0.011);

    float zenithAlong = fcard_hash(float2(t * 0.13, 1.7));
    float zenithHeight = fcard_hash(float2(t * 0.29, 8.3));
    float rayFrequency = mix(4.5, 6.8, fcard_hash(float2(t * 0.41, 5.1)));
    float2 zenith = float2(
        mix(0.55, 1.08, mix(shape, zenithAlong, 0.65)),
        -mix(0.12, 0.45, zenithHeight)
    );

    // Distances are corrected for the card's aspect (tuned at 2.2:1), so a
    // slimmer row and the wide folder header keep the same circular fan
    // instead of stretched streaks.
    float2 p = uv - zenith;
    p.x *= aspect / 2.2;
    float r = length(p);
    float angle = atan2(p.y, p.x);
    float density = fcard_fbm(float2(angle * rayFrequency + ta * 0.02, r * 1.2 - ta * 0.015));
    float rays = smoothstep(0.26, 0.72, density);
    float rayDetail = smoothstep(0.45, 0.85, fcard_fbm(float2(angle * 9.5 + 3.7, r * 1.6 + ta * 0.01)));
    // Tall cards (`bottomFade` 1, the folder header) shorten every ray's
    // radial reach — each ray by its own amount — so the fan tapers out
    // through its normal falloff and simply runs out of light before the
    // bottom edge. No cut, no shared fade line. Slim rows keep the long
    // reach: their whole height is the fan's heart.
    float rayReach = mix(
        2.0,
        mix(0.80, 1.20, fcard_fbm(float2(angle * 6.0 + 2.9, 4.2))),
        bottomFade
    );
    float reach = pow(clamp(1.0 - (r - 0.30) / rayReach, 0.0, 1.0), 1.7);
    float beam = rays * reach;

    col += fcard_rich(tint) * beam * 0.62;
    col += fcard_rich(mid) * (density * 0.5 + rayDetail * 0.5) * reach * 0.15;
    col += highlight * pow(beam, 3.0) * 0.16;

    return float4(clamp(col, 0.0, 1.0), 1.0);
}
