import {Component} from "../../core/Component.ts"

// 2D流体シミュレーションのGPUバッファデータを保有するコンポネント
export class GridFluidComponent extends Component{
    // シミュレーションデータバッファ (GridFluidSystem.init()で初期化)
    velA!: GPUBuffer; // velocity ping buffer A (vec2<f32> x WxH)
    velB!: GPUBuffer; // velocity ping buffer B 
    dyeA!: GPUBuffer; // dye ping buffer A (vec4<f32> x WxH)
    dyeB!: GPUBuffer; // dye ping buffer B
    div!: GPUBuffer; // divergence buffer (f32 x WxH)
    pressA!: GPUBuffer; // dye ping buffer A (f32 x WxH)
    pressB!: GPUBuffer; // dye ping buffer B
    curlBuf! : GPUBuffer; // curl buffer (f32 x WxH)

    // ping - pong 状態
    vel_ping : number = 0; // 0 -> velA, 1 -> velB
    dye_ping : number = 0;
    pres_ping : number = 0;

    // シミュレーションデータバッファの解除
    protected onDestroy(): void {
        this.velA?.destroy();
        this.velB?.destroy();
        this.dyeA?.destroy();
        this.dyeB?.destroy();
        this.div?.destroy();
        this.pressA?.destroy();
        this.pressB?.destroy();
        this.curlBuf?.destroy();
    }
}