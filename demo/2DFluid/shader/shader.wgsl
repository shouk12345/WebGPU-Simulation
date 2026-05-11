struct RenderParams {
    width: u32,
    height: u32,
    dye_ping : u32,
    _pad: u32,
};

@group(0) @binding(0) var<uniform> rp : RenderParams;
@group(0) @binding(1) var<storage, read> dyeA : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> dyeB : array<vec4<f32>>;

// vertex - fullscreen triangle
struct VertexOutput {
    @builtin(position) pos : vec4<f32>,
    @location(0) uv : vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) idx : u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 3.0, -1.0),
        vec2<f32>(-1.0,  3.0),
    );
    let p = positions[idx];
    var out : VertexOutput;
    out.pos = vec4<f32>(p, 0.0, 1.0);
    // NDC座標(-1~1)をテクスチャ座標(0~1)に変換(x[-1,1] -> [0,1], y[-1,1] -> [0,1] yは上下逆) 
    out.uv = vec2<f32>(p.x * 0.5 + 0.5, -p.y * 0.5 + 0.5);
    return out;
}

// helper function
fn clampIdx(x : i32, y : i32) -> u32 {
    let cx = clamp(x, 0, i32(rp.width) - 1);
    let cy = clamp(y, 0, i32(rp.height) - 1);
    return u32(cy) * rp.width + u32(cx);
}

fn dyeAt(x : i32, y : i32) -> vec4<f32> {
    let i = clampIdx(x, y);
    if(rp.dye_ping == 0u) {
        return dyeA[i];
    }
    return dyeB[i];
}

fn sampleDye(uv : vec2<f32>) -> vec4<f32> {
    let suv = clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0));
    let px = suv.x * f32(rp.width) - 0.5;
    let py = suv.y * f32(rp.height) - 0.5;
    let x0 = i32(floor(px));
    let y0 = i32(floor(py));
    let fx = fract(px);
    let fy = fract(py);
    return mix(
        mix(dyeAt(x0, y0), dyeAt(x0 + 1, y0), fx),
        mix(dyeAt(x0, y0 + 1), dyeAt(x0 + 1, y0 + 1), fx),
        fy);
}

// fragment
@fragment 
fn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {
    let color = sampleDye(in.uv).rgb;
    // Reinhard tone mappingより1.0を超える値を圧縮
    // bloom — 1.0 초과분만 뽑아서 주변에 퍼뜨림
    let sx = 1.0 / f32(rp.width);
    let sy = 1.0 / f32(rp.height);
    var bloom = vec3<f32>(0.0);
    var weight_sum = 0.0;

    for (var dy = -3; dy <= 3; dy++) {
        for (var dx = -3; dx <= 3; dx++) {
            let uv2 = in.uv + vec2<f32>(f32(dx) * sx, f32(dy) * sy);
            let s = sampleDye(uv2).rgb;
            let w = exp(-f32(dx*dx + dy*dy) * 0.3);
            bloom += max(s - vec3<f32>(1.0), vec3<f32>(0.0)) * w;
            weight_sum += w;
        }
    }
    bloom /= weight_sum;

    // Reinhard + bloom 합성
    let base = color / (color + vec3<f32>(1.0));
    return vec4<f32>(base + bloom * 0.8, 1.0);
}