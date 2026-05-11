import type { IComputeSystem } from "../../core/IComputeSystem";
import type { ISimulatorContext } from "../../core/ISimulatorContext";
import { GridFluidComponent } from "./GridFluidComponent";
import { GridParamComponent } from "./GridParamComponent";
import { FluidInputComponent } from "./FluidInputComponent";

// work groupサイズ
const WORKGROUP_SIZE = 8;

// GPU buffer stride
const BYTES_F32 = 4; // sizeof(f32) 
const BYTES_VEC2 = 8; // sizeof(vec2<f32>)
const BYTES_VEC4 = 16; // sizeof(vec4<f32>)
const SPLAT_STRIDE = 48; // sizeof(SplatData) : vec2 + vec2 + vec4 + f32 + pad = 48
const SIM_STRIDE = 32; // sizeof(SimParams) : u32 + u32 + f32 + f32 + u32 + pad = 32

export class GridFluidSystem implements IComputeSystem{
    private device! : GPUDevice;

    private simParamsBuf! : GPUBuffer;
    private splatsBuf! : GPUBuffer;
    private computeBindGroup! : GPUBindGroup;

    private module! : GPUShaderModule;
    private splatPipelines! : GPUComputePipeline[];
    private advectVelPipelines! : GPUComputePipeline[];
    private advectDyePipelines! : GPUComputePipeline[];
    private divPipelines! : GPUComputePipeline[];
    private pressPipelines! : GPUComputePipeline[];
    private gradPipelines! : GPUComputePipeline[][];
    private curlPipelines! : GPUComputePipeline[];
    private vorticityPipelines! : GPUComputePipeline[];

    private wgX!: number;
    private wgY!: number;
    private simData!: Float32Array;
    private splatData!: Float32Array;

    constructor(private readonly _ctx : ISimulatorContext){}

    async init(device: GPUDevice): Promise<void> {
        this.device = device;

        //　シミュレーションデータを所有しているコンポネントを参照
        const params = this._ctx.getComponents(GridParamComponent);
        const fluids = this._ctx.getComponents(GridFluidComponent);
        if(!params.length || !fluids.length) 
            throw new Error("GridFluidSystem: GridParamComponent or GridFluidComponent not found");

        const param = params[0];
        const fluid = fluids[0];
        const {width, height} = param;
        const cellCount = width * height;

        // GPUバッファ生成関数
        const mkBuf = (size: number, usage: GPUBufferUsageFlags) : GPUBuffer => 
            device.createBuffer({size, usage, mappedAtCreation: false});
        
        const VEL = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
        const STOR = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
        const UNIF = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;

        // シミュレーションデータバッファ(fluidComponentで所有)生成
        fluid.velA = mkBuf(cellCount * BYTES_VEC2, VEL);
        fluid.velB = mkBuf(cellCount * BYTES_VEC2, VEL);
        fluid.dyeA = mkBuf(cellCount * BYTES_VEC4, STOR);
        fluid.dyeB = mkBuf(cellCount * BYTES_VEC4, STOR);
        fluid.div = mkBuf(cellCount * BYTES_F32, STOR);
        fluid.pressA = mkBuf(cellCount * BYTES_F32, STOR);
        fluid.pressB = mkBuf(cellCount * BYTES_F32, STOR);
        fluid.curlBuf = mkBuf(cellCount * BYTES_F32, STOR);

        // パイプラインバッファ生成
        this.simParamsBuf = mkBuf(SIM_STRIDE,  UNIF);
        this.splatsBuf = mkBuf(param.MAX_SPLAT * SPLAT_STRIDE, STOR);
        this.simData = new Float32Array(SIM_STRIDE / 4);
        this.splatData = new Float32Array(SPLAT_STRIDE / 4 * param.MAX_SPLAT);

        // シェーダーモジュール初期化
        const src = await fetch(new URL("./shader/compute.wgsl", import.meta.url)).then(r => r.text());
        this.module = device.createShaderModule({code: src});

        // バインドグループとパイプラインのレイアウトを生成
        const bgl = device.createBindGroupLayout({
            entries: [
                {binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: {type: "uniform"}},
                {binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: {type: "read-only-storage"}},
                {binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: {type: "storage"}},
                {binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: {type: "storage"}},
                {binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: {type: "storage"}},
                {binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: {type: "storage"}},
                {binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: {type: "storage"}},
                {binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: {type: "storage"}},
                {binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: {type: "storage"}},
                {binding: 9, visibility: GPUShaderStage.COMPUTE, buffer: {type: "storage"}},
            ],
        });
        const layout = device.createPipelineLayout({bindGroupLayouts: [bgl]});

        this.computeBindGroup = device.createBindGroup({
            layout: bgl,
            entries: [
                {binding: 0, resource: {buffer: this.simParamsBuf}},
                {binding: 1, resource: {buffer: this.splatsBuf}},
                {binding: 2, resource: {buffer: fluid.velA}},
                {binding: 3, resource: {buffer: fluid.velB}},
                {binding: 4, resource: {buffer: fluid.dyeA}},
                {binding: 5, resource: {buffer: fluid.dyeB}},
                {binding: 6, resource: {buffer: fluid.div}},
                {binding: 7, resource: {buffer: fluid.pressA}},
                {binding: 8, resource: {buffer: fluid.pressB}},
                {binding: 9, resource: {buffer: fluid.curlBuf}},
            ],
        });

        // パイプライン生成関数
        const mk = (entry : string, consts : Record<string, number>) : GPUComputePipeline => 
            device.createComputePipeline({
                layout,
                compute: {
                    module: this.module, entryPoint: entry, constants: consts,
                },
        });

        // パイプラインセット
        // PING-PONg用に2セットずつ用意
        this.splatPipelines = [
            mk('cs_splat', {VEL_PING:0, DYE_PING : 0, PRES_PING: 0}),
            mk('cs_splat', {VEL_PING:1, DYE_PING : 1, PRES_PING: 0})
        ];
        this.advectVelPipelines = [
            mk('cs_advect_vel', {VEL_PING:0, DYE_PING : 0, PRES_PING: 0}),
            mk('cs_advect_vel', {VEL_PING:1, DYE_PING : 0, PRES_PING: 0})
        ];
        this.advectDyePipelines = [
            mk('cs_advect_dye', {VEL_PING:0, DYE_PING : 0, PRES_PING: 0}),
            mk('cs_advect_dye', {VEL_PING:0, DYE_PING : 1, PRES_PING: 0})
        ];
        this.divPipelines = [
            mk('cs_divergence', {VEL_PING:0, DYE_PING : 0, PRES_PING: 0}),
            mk('cs_divergence', {VEL_PING:1, DYE_PING : 0, PRES_PING: 0}),
        ];
        this.pressPipelines = [
            mk('cs_pressure', {VEL_PING:0, DYE_PING : 0, PRES_PING: 0}),
            mk('cs_pressure', {VEL_PING:0, DYE_PING : 0, PRES_PING: 1}),
        ];
        // gradPipelinesは圧力のPING-PONGと速度のPING-PONGの組み合わせで4パターン
        this.gradPipelines = [
            [mk('cs_gradient', {VEL_PING:0, DYE_PING : 0, PRES_PING: 0}),
            mk('cs_gradient', {VEL_PING:0, DYE_PING : 0, PRES_PING: 1}),],
            [mk('cs_gradient', {VEL_PING:1, DYE_PING : 0, PRES_PING: 0}),
            mk('cs_gradient', {VEL_PING:1, DYE_PING : 0, PRES_PING: 1}),],
        ];
        this.curlPipelines = [
            mk('cs_curl', {VEL_PING:0, DYE_PING : 0, PRES_PING: 0}),
            mk('cs_curl', {VEL_PING:1, DYE_PING : 0, PRES_PING: 0}),
        ];
        this.vorticityPipelines = [
            mk('cs_vorticity', {VEL_PING:0, DYE_PING : 0, PRES_PING: 0}),
            mk('cs_vorticity', {VEL_PING:1, DYE_PING : 0, PRES_PING: 0}),
        ];


        this.wgX = Math.ceil(width / WORKGROUP_SIZE);
        this.wgY = Math.ceil(height / WORKGROUP_SIZE);
    }

    Update(dt: number): void {
        const params = this._ctx.getComponents(GridParamComponent);
        const fluids = this._ctx.getComponents(GridFluidComponent);
        const inputs = this._ctx.getComponents(FluidInputComponent);
        if(!fluids.length || !params.length) return;

        const f = fluids[0];
        const p = params[0];
        const queue = inputs.length ? inputs[0].queue : [];
        const splatCount = Math.min(queue.length, p.MAX_SPLAT);

        this.splatData.fill(0);
        for(let i=0; i<splatCount; i++){
            const s = queue[i];
            const base = i * (SPLAT_STRIDE / BYTES_F32);
            this.splatData[base + 0] = s.pos[0];
            this.splatData[base + 1] = s.pos[1];
            this.splatData[base + 2] = s.delta[0];
            this.splatData[base + 3] = s.delta[1];
            this.splatData[base + 4] = s.color[0];
            this.splatData[base + 5] = s.color[1];
            this.splatData[base + 6] = s.color[2];
            this.splatData[base + 7] = s.color[3];
            this.splatData[base + 8] = s.radius;
            this.splatData[base + 9] = s.vortex;
        }
        queue.length = 0;

        const u = new Uint32Array(this.simData.buffer);
        u[0] = p.width;
        u[1] = p.height;
        this.simData[2] = dt;
        this.simData[3] = p.dissipation;
        this.simData[5] = p.curlStrength;
        u[4] = splatCount;
        this.device.queue.writeBuffer(this.simParamsBuf, 0, this.simData.buffer);
        if(splatCount > 0) this.device.queue.writeBuffer(this.splatsBuf, 0, this.splatData.buffer);

        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        const dispatch = (pipeline : GPUComputePipeline) => {
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, this.computeBindGroup);
            pass.dispatchWorkgroups(this.wgX, this.wgY);
        };

        if(splatCount > 0) dispatch(this.splatPipelines[f.vel_ping]);
        dispatch(this.advectVelPipelines[f.vel_ping]); f.vel_ping ^= 1;
        dispatch(this.advectDyePipelines[f.dye_ping]); f.dye_ping ^= 1;
        dispatch(this.curlPipelines[f.vel_ping]);
        dispatch(this.vorticityPipelines[f.vel_ping]);
        dispatch(this.divPipelines[f.vel_ping]);
        for(let i = 0; i < p.jacobIter; i++){
            dispatch(this.pressPipelines[f.pres_ping]); 
            f.pres_ping ^= 1;
        }
        dispatch(this.gradPipelines[f.vel_ping][f.pres_ping]);
        f.vel_ping ^= 1;

        pass.end();
        this.device.queue.submit([encoder.finish()]);
    }

    Destroy(): void {
        this.simParamsBuf?.destroy();
        this.splatsBuf?.destroy();
    }
}