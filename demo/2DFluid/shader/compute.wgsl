// override constant
override VEL_PING : u32 = 0u; // 0->VelA読みVelBに書き込み、1->VelB読みVelAに書き込み 以下同様
override DYE_PING : u32 = 0u;
override PRES_PING : u32 = 0u;

// 固定constant
const MAX_SPLATS : u32 = 8u;
const WORKGROUP : u32 = 8u;

// uniform & buffer
struct SimParams {
    width : u32, // grid width
    height : u32, // grid height
    dt : f32, // デルタタイム(sec)
    dissipation : f32, // フレーム間の減衰率(0~1)
    splat_count : u32,  // 今フレームのスプラットの数
    curl_strength : f32, // 渦巻の強さ
    _p0 : f32, _p1 : f32, // padding
}

struct SplatData {
    pos : vec2<f32>, // 正規化されたスプラットの位置(0~1)
    delta : vec2<f32>, // スプラットのデルタ速度(texel/sec)
    color : vec4<f32>, // スプラットの色(rgba)
    radius : f32, // 正規化されたスプラットの半径(0~1)
    vortex : f32,
    _p0 : f32, _p1 : f32, // padding
}

@group(0) @binding(0) var<uniform> sim : SimParams;
@group(0) @binding(1) var<storage, read> splats : array<SplatData, MAX_SPLATS>;
@group(0) @binding(2) var<storage, read_write> velA : array<vec2<f32>>;
@group(0) @binding(3) var<storage, read_write> velB : array<vec2<f32>>;
@group(0) @binding(4) var<storage, read_write> dyeA : array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> dyeB : array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> div : array<f32>;
@group(0) @binding(7) var<storage, read_write> presA : array<f32>;
@group(0) @binding(8) var<storage, read_write> presB : array<f32>;
@group(0) @binding(9) var<storage, read_write> curl_buf : array<f32>;

// ヘルパー関数
fn clampIdx(x: i32, y: i32) -> u32 {
    let cx = clamp(x, 0, i32(sim.width) - 1);
    let cy = clamp(y, 0, i32(sim.height) - 1);
    return u32(cy) * sim.width + u32(cx);
}

fn velAt(x: i32, y: i32) -> vec2<f32> {
    let i = clampIdx(x, y);
    if(VEL_PING == 0u) {
        return velA[i];
    }
    return velB[i];
}

fn velWrite(i : u32, v: vec2<f32>) {
    if(VEL_PING == 0u) {
        velB[i] = v;
    } else {
        velA[i] = v;
    }
}

fn dyeAt(x: i32, y: i32) -> vec4<f32> {
    let i = clampIdx(x, y);
    if(DYE_PING == 0u) {
        return dyeA[i];
    }
    return dyeB[i];
}

fn dyeWrite(i : u32, c: vec4<f32>) {
    if(DYE_PING == 0u) {
        dyeB[i] = c;
    } else {
        dyeA[i] = c;
    }
}

fn presAt(x: i32, y: i32) -> f32 {
    let i = clampIdx(x, y);
    if(PRES_PING == 0u) {
        return presA[i];
    }
    return presB[i];
}

fn presWrite(i : u32, p: f32) {
    if(PRES_PING == 0u) {
        presB[i] = p;
    } else {
        presA[i] = p;
    }
}

// 速度場の線形補間さんプリング(semi-Lagrangian backtrace)
fn sampleVel(uv: vec2<f32>) -> vec2<f32> {
    let suv = clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0));
    let px = suv.x *f32(sim.width) - 0.5;
    let py = suv.y *f32(sim.height) - 0.5;
    let x0 = i32(floor(px));
    let y0 = i32(floor(py));
    let fx = fract(px);
    let fy = fract(py);
    return mix(
        mix(velAt(x0, y0), velAt(x0 + 1, y0), fx),
        mix(velAt(x0, y0 + 1), velAt(x0 + 1, y0 + 1), fx),
        fy
    );
}

fn sampleDye(uv: vec2<f32>) -> vec4<f32> {
    let suv = clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0));
    let px = suv.x *f32(sim.width) - 0.5;
    let py = suv.y *f32(sim.height) - 0.5;
    let x0 = i32(floor(px));
    let y0 = i32(floor(py));
    let fx = fract(px);
    let fy = fract(py);
    return mix(
        mix(dyeAt(x0, y0), dyeAt(x0 + 1, y0), fx),
        mix(dyeAt(x0, y0 + 1), dyeAt(x0 + 1, y0 + 1), fx),
        fy
    );
}

// splat
// マウスのクリック位置に加速度と色を加える
@compute @workgroup_size(WORKGROUP,WORKGROUP)
fn cs_splat(@builtin(global_invocation_id) gid: vec3<u32>) {
    if(gid.x >= sim.width || gid.y >= sim.height) {return;}
    let i = gid.y * sim.width + gid.x;
    let uv = (vec2<f32>(f32(gid.x), f32(gid.y)) + 0.5)
    / vec2<f32>(f32(sim.width), f32(sim.height));

    var vel_add = vec2<f32>(0.0);
    var dye_add = vec4<f32>(0.0);

    for(var k = 0u; k < sim.splat_count; k++) {
        let s = splats[k];
        let diff = uv - s.pos;
        // ガウシアン関数でスプラットの影響を計算
        let inf = exp(-dot(diff, diff) / (s.radius * s.radius + 1e-6));
        vel_add += s.delta * inf;
        let perp = vec2<f32>(
            -diff.y * f32(sim.height),
            diff.x * f32(sim.width)
        );
        vel_add += perp * length(s.delta) * s.vortex * inf;
        dye_add += s.color * inf;
    }

    // 現在のPingバッファに書き込む
    if(VEL_PING == 0u) {
        velA[i] = velA[i] + vel_add;
    } else {
        velB[i] = velB[i] + vel_add;
    }

    if(DYE_PING == 0u) {
        dyeA[i] = dyeA[i] + dye_add;
    } else {
        dyeB[i] = dyeB[i] + dye_add;
    }
}

// advect velocity & dye
// semi-Lagrangian法で速度と色を移動させる
@compute @workgroup_size(WORKGROUP,WORKGROUP)
fn cs_advect_vel(@builtin(global_invocation_id) gid : vec3<u32>) {
    if(gid.x >= sim.width || gid.y >= sim.height) {return;}
    let i = gid.y * sim.width + gid.x;
    let uv = (vec2<f32>(f32(gid.x), f32(gid.y)) + 0.5)
    / vec2<f32>(f32(sim.width), f32(sim.height));
    
    let vel = velAt(i32(gid.x), i32(gid.y));

    // 逆流跡をたどる
    let vel_uv = vel / vec2<f32>(f32(sim.width), f32(sim.height));
    let prev_uv = uv - vel_uv * sim.dt;
    let advected = sampleVel(prev_uv) * sim.dissipation; // 減衰
    velWrite(i, advected);
}

@compute @workgroup_size(WORKGROUP,WORKGROUP)
fn cs_advect_dye(@builtin(global_invocation_id) gid : vec3<u32>) {
    if(gid.x >= sim.width || gid.y >= sim.height) {return;}
    let i = gid.y * sim.width + gid.x;
    let uv = (vec2<f32>(f32(gid.x), f32(gid.y)) + 0.5)
    / vec2<f32>(f32(sim.width), f32(sim.height));
    
    let vel = velAt(i32(gid.x), i32(gid.y));

    // 逆流跡をたどる
    let vel_uv = vel / vec2<f32>(f32(sim.width), f32(sim.height));
    let prev_uv = uv - vel_uv * sim.dt;
    let advected = sampleDye(prev_uv) * sim.dissipation; // 減衰
    dyeWrite(i, advected);
}

// divergence
// 中央差分を使って発散を計算(∇·v)
@compute @workgroup_size(WORKGROUP,WORKGROUP)
fn cs_divergence(@builtin(global_invocation_id) gid : vec3<u32>) {
    if(gid.x >= sim.width || gid.y >= sim.height) {return;}
    let x = i32(gid.x);
    let y = i32(gid.y);
    let i = gid.y * sim.width + gid.x;

    let L = velAt(x - 1, y).x;
    let R = velAt(x + 1, y).x;
    let B = velAt(x, y - 1).y;
    let T = velAt(x, y + 1).y;
    div[i] = 0.5 * (R - L + T - B);
}

// pressure
// ジャコビ法で圧力を解く
// N回の反復で異なるPingバッファに交互に書き込む(presA-> presB, presB->presA) 
@compute @workgroup_size(WORKGROUP,WORKGROUP)
fn cs_pressure(@builtin(global_invocation_id) gid : vec3<u32>){
    if(gid.x >= sim.width || gid.y >= sim.height) {return;}
    let x = i32(gid.x);
    let y = i32(gid.y);
    let i = gid.y * sim.width + gid.x;

    let L = presAt(x - 1, y);
    let R = presAt(x + 1, y);
    let B = presAt(x, y - 1);
    let T = presAt(x, y + 1);
    let d = div[i];
    // ジャコビ法の更新式
    let p = (L + R + B + T - d) * 0.25;
    presWrite(i, p);
}

// gradient subtraction
// 発散のない速度として射影
@compute @workgroup_size(WORKGROUP,WORKGROUP)
fn cs_gradient(@builtin(global_invocation_id) gid : vec3<u32>) {
    if(gid.x >= sim.width || gid.y >= sim.height) {return;}
    let x = i32(gid.x);
    let y = i32(gid.y);
    let i = gid.y * sim.width + gid.x;

    let L = presAt(x - 1, y);
    let R = presAt(x + 1, y);
    let B = presAt(x, y - 1);
    let T = presAt(x, y + 1);

    let grad = vec2<f32>(
        (R-L) * 0.5,
        (T-B) * 0.5
    );
    velWrite(i, velAt(x, y) - grad);
}

// curl (vorticity計算)
@compute @workgroup_size(WORKGROUP,WORKGROUP)
fn cs_curl(@builtin(global_invocation_id) gid : vec3<u32>) {
    if(gid.x >= sim.width || gid.y >= sim.height) {return;}
    let x = i32(gid.x);
    let y = i32(gid.y);
    let i = gid.y * sim.width + gid.x;

    // ω = ∂vy/∂x - ∂vx/∂y (中央差分)
    let dvy_dx = (velAt(x+1, y).y - velAt(x-1, y).y) * 0.5;
    let dvx_dy = (velAt(x, y+1).x - velAt(x, y-1).x) * 0.5;
    curl_buf[i] = dvy_dx - dvx_dy;
}

// vorticity confinment
@compute @workgroup_size(WORKGROUP,WORKGROUP)
fn cs_vorticity(@builtin(global_invocation_id) gid : vec3<u32>) {
    if(gid.x >= sim.width || gid.y >= sim.height) {return;}
    let x = i32(gid.x);
    let y = i32(gid.y);
    let i = gid.y * sim.width + gid.x;

    // |ω|の勾配
    let eta_x = (abs(curl_buf[clampIdx(x+1,y)]) - abs(curl_buf[clampIdx(x-1,y)])) * 0.5;
    let eta_y = (abs(curl_buf[clampIdx(x,y+1)]) - abs(curl_buf[clampIdx(x,y-1)])) * 0.5;
    let N = vec2<f32>(eta_x, eta_y) / (length(vec2<f32>(eta_x, eta_y))+ 1e-6);

    let omega = curl_buf[i];
    let force = sim.curl_strength * vec2<f32>(N.y * omega, -N.x * omega);

    // 現在のPingバッファに書き込む
    if (VEL_PING == 0u) { 
        velA[i] = velA[i] + force * sim.dt; 
    }else{ 
        velB[i] = velB[i] + force * sim.dt; 
    }
}