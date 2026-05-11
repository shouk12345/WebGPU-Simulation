import type{IRenderSystem} from "../../core/IRenderSystem";
import type{ISimulatorContext} from "../../core/ISimulatorContext";
import { GridParamComponent } from "./GridParamComponent";
import { GridFluidComponent } from "./GridFluidComponent";

const RENDER_STRIDE = 16; // width(u32) + height(u32) + dye_ping(u32) + pad(u32) = 16 bytes

export class FluidRenderSystem implements IRenderSystem{
    private _device! : GPUDevice;
    private _bindGroup! : GPUBindGroup;
    private _pipeline! : GPURenderPipeline;
    private _renderParamsBuf! : GPUBuffer;
    private _renderData! : Uint32Array;

    constructor(private readonly _ctx : ISimulatorContext){}

    async init(device: GPUDevice, _context: GPUCanvasContext): Promise<void> {
        this._device = device;

        const fluids = this._ctx.getComponents(GridFluidComponent);
        if(!fluids.length) throw new Error("FluidRenderSystem: GridFluidComponent not found");
        const fluid = fluids[0];
        
        this._renderParamsBuf = device.createBuffer({
            size: RENDER_STRIDE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this._renderData = new Uint32Array(RENDER_STRIDE / 4);

        const src = await fetch(new URL("./shader/shader.wgsl", import.meta.url)).then(r => r.text());
        const module = device.createShaderModule({code: src});
        const compilelationInfo = await module.getCompilationInfo();
        if(compilelationInfo.messages.length > 0){
            compilelationInfo.messages.forEach(msg =>{
                console.error(`wgsl error (${msg.lineNum}:${msg.linePos}): ${msg.message}`);
            });
        }
        
        const bgl = device.createBindGroupLayout({
            entries: [
                {binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: {type: "uniform"}},
                {binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: {type: "read-only-storage"}},
                {binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: {type: "read-only-storage"}},
            ],
        });

        this._bindGroup = device.createBindGroup({
            layout: bgl,
            entries: [
                {binding: 0, resource: {buffer: this._renderParamsBuf}},
                {binding: 1, resource: {buffer: fluid.dyeA}},
                {binding: 2, resource: {buffer: fluid.dyeB}},
            ],
        });

        this._pipeline = device.createRenderPipeline({
            layout: device.createPipelineLayout({bindGroupLayouts: [bgl]}),
            vertex: {module, entryPoint: "vs_main"},
            fragment: {
                module, entryPoint: "fs_main", 
                targets: [{format: navigator.gpu.getPreferredCanvasFormat()}],
            },
            primitive: {topology: "triangle-list"},
         });
    }

    Render(encoder: GPUCommandEncoder, view: GPUTextureView): void {
        // レンダリング時にシミュレーションデータを参照して、描画に必要なパラメータを更新
        const params = this._ctx.getComponents(GridParamComponent);
        const fluids = this._ctx.getComponents(GridFluidComponent);
        if(!params || !fluids.length) return;
        const fluid = fluids[0];
        const param = params[0];

        this._renderData[0] = param.width;
        this._renderData[1] = param.height;
        this._renderData[2] = fluid.dye_ping;
        this._renderData[3] = 0; // padding
        this._device.queue.writeBuffer(this._renderParamsBuf, 0, this._renderData.buffer);

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view,
                loadOp: "clear",
                clearValue: {r:0, g:0, b:0, a:1},
                storeOp: "store",
            }],
        });
        pass.setPipeline(this._pipeline);
        pass.setBindGroup(0, this._bindGroup);
        pass.draw(3); // フルスクリーン三角形を描画
        pass.end();
    }
    
    Destroy(): void {
        this._renderParamsBuf.destroy();
    }
}