import type {IRenderer} from "../../core/IRenderer";
import type {ISimulatorContext} from "../../core/ISimulatorContext";
import {FluidRenderSystem} from "./FluidRenderSystem";

export class FluidRenderer implements IRenderer{
    private _device! : GPUDevice;
    private _context! : GPUCanvasContext;

    private readonly _fluidRenderSystem : FluidRenderSystem;

    constructor(
        private readonly _canvas : HTMLCanvasElement,
        _ctx : ISimulatorContext
    ){
        this._fluidRenderSystem = new FluidRenderSystem(_ctx);
    }

    async init(device : GPUDevice): Promise<void> {
        this._device = device;

        const gpuCtx = this._canvas.getContext("webgpu") as GPUCanvasContext | null;
        if(!gpuCtx) throw new Error("Failed to get GPU canvas context");
        this._context = gpuCtx;

        this._context.configure({
            device: this._device,
            format: navigator.gpu.getPreferredCanvasFormat(),
            alphaMode: "opaque",
        });

        await this._fluidRenderSystem.init(this._device, this._context);
    }

    Render(): void {
        const view = this._context.getCurrentTexture().createView();
        const encoder = this._device.createCommandEncoder();

        this._fluidRenderSystem.Render(encoder, view);
        this._device.queue.submit([encoder.finish()]);
    }

    Resize(width: number, height: number): void {
        this._canvas.width = width;
        this._canvas.height = height;
    }

    Destroy(): void {
        this._fluidRenderSystem.Destroy();
        this._device.destroy();
    }
}