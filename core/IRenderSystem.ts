import type { ISystem } from "./ISystem";

export interface IRenderSystem extends ISystem{

    // render pass 専用リソースを初期化
    init(device : GPUDevice, context : GPUCanvasContext) : Promise<void>;

    //　render passを実行する。コマンドエンコーダーと描画先のビューを受け取る。
    Render(encoder : GPUCommandEncoder, view : GPUTextureView): void;

    Destroy() : void;
}