#include <metal_stdlib>
using namespace metal;

struct VertexOut {
    float4 position [[position]];
    float2 uv;
};

vertex VertexOut gradient_vertex(uint vid [[vertex_id]]) {
    float2 positions[] = {
        float2(-1, -1), float2(3, -1), float2(-1, 3)
    };
    VertexOut out;
    out.position = float4(positions[vid], 0, 1);
    out.uv = positions[vid] * 0.5 + 0.5;
    out.uv.y = 1.0 - out.uv.y;
    return out;
}

// The "hero" mesh from the web app's BlueMeshGradient, in
// apps/web/src/components/marketing/hero/blue-mesh-gradient.tsx — the same field
// the marketing home page header runs. The anchor geometry, falloff and
// illumination are that handoff's values.
//
// That file also holds share/workflow/footer/login variants. This is the header
// one on purpose: the darker `login` variant loses the blue through the middle.
constant int anchorCount = 4;

constant float3 baseColor = float3(13.0, 16.0, 30.0) / 255.0;

constant float3 anchorColors[anchorCount] = {
    float3( 47.0,  83.0, 164.0) / 255.0,
    float3(128.0,  57.0, 127.0) / 255.0,
    float3(105.0,  25.0,  84.0) / 255.0,
    float3( 82.0,  91.0, 169.0) / 255.0,
};

constant float2 anchorPositions[anchorCount] = {
    float2(0.19, 0.32),
    float2(0.84, 0.14),
    float2(0.06, 0.94),
    float2(0.55, 0.68),
};

// radius * reach. The web code squares this product to get the spread.
constant float anchorReaches[anchorCount] = {
    0.52 * 0.76,
    0.72 * 0.52,
    0.40 * 0.78,
    0.62 * 0.98,
};

constant float falloff = 1.75;
constant float illumination = 0.42;

// The web canvas sits at inset -3% and 106% size, so what a visitor sees is the
// middle 100/106 of the field. Without this the anchors land off-position.
constant float overscanInset = 0.03;
constant float overscanScale = 1.06;

// Stands in for the canvas's CSS `saturate(1.3)`.
constant float saturation = 1.3;
constant float3 luminanceWeights = float3(0.213, 0.715, 0.072);

fragment float4 gradient_fragment(VertexOut in [[stage_in]]) {
    float2 uv = (in.uv + overscanInset) / overscanScale;

    // Each anchor pulls the running colour toward its own, so the order of the
    // anchors is part of the result.
    float3 color = baseColor;

    for (int i = 0; i < anchorCount; i += 1) {
        float2 delta = uv - anchorPositions[i];
        float spread = anchorReaches[i] * anchorReaches[i];
        float weight = exp((-falloff * dot(delta, delta)) / spread) * illumination;

        color += (anchorColors[i] - color) * weight;
    }

    float luminance = dot(color, luminanceWeights);
    color = clamp(luminance + (color - luminance) * saturation, 0.0, 1.0);

    return float4(color, 1.0);
}
