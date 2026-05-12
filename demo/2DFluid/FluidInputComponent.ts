import { GridParamComponent } from "./GridParamComponent";
import type { ISimulatorContext } from "../../core/ISimulatorContext";
import { InputComponent, type InputEventBinding } from "../../core/InputComponent";

// splat イベントデータ
export interface SplatInfo{
    pos : [number, number];
    delta : [number, number];
    color : [number, number, number, number];
    radius : number;
    vortex: number;
}

// ポインターイベントを受信し、SplatInfoキューを生成するInputComponent具現クラス
export class FluidInputComponent extends InputComponent{
    // SplatInfo 出力キュー・GridFluidSystemで消費
    readonly queue: SplatInfo[] = [];

    //HSV色循環状態
    hue : number = 0;

    private _pressed: boolean = false;
    private _prevX : number = 0;
    private _prevY : number = 0;
    private _element : HTMLElement | null = null;

    constructor(private readonly _ctx : ISimulatorContext){
        super();
    }

    // バインドするイベント目録を返還
    getBindings(element : HTMLElement) : InputEventBinding[] {
        this._element = element;
        (element as HTMLCanvasElement).style.touchAction = "none";
        return [
            {type:'pointerdown', handler: this._onDown},
            {type:'pointermove', handler: this._onMove},
            {type:'pointerup', handler: this._onUp},
            {type:'pointercancel', handler: this._onUp},
        ];
    }

    protected onDestroy() : void {
        this.queue.length = 0;
        this._element = null;
    }

    // イベントハンドラー
    private _onDown = (e:Event) :void =>{
        const pe = e as PointerEvent;
        this._pressed = true;
        this._prevX= pe.clientX;
        this._prevY = pe.clientY;
        (e.target as HTMLElement).setPointerCapture?.(pe.pointerId);
        this._emit(pe.clientX, pe.clientY,0,0, true);
    }; 

    private _onMove = (e:Event) :void =>{
        if(!this._pressed) return;
        const pe = e as PointerEvent;
        this._pressed = true;
        const dx = pe.clientX - this._prevX;
        const dy = pe.clientY - this._prevY;
        this._emit(pe.clientX, pe.clientY,dx,dy, false);
        this._prevX = pe.clientX;
        this._prevY = pe.clientY;
    };

    private _onUp = (e:Event) :void =>{
        this._pressed = false;
    };

    private _emit(cx : number, cy : number, dx: number, dy: number, isDown: boolean):void{
        const params = this._ctx.getComponents(GridParamComponent)[0];
        if(!this._element || !params || this.queue.length >= params.MAX_SPLAT) return;

        const rect  = this._element.getBoundingClientRect();
        const scale = params.velocityScale / rect.width;
        const posX  = (cx - rect.left) / rect.width;
        const posY  = (cy - rect.top)  / rect.height;

        this.hue = (this.hue + 0.001) % 1.0;
        const color = hsvToRgba(this.hue, 1.0, 1.0);

        if (isDown) {
            // タッチダウン-単一渦巻
            if (this.queue.length >= params.MAX_SPLAT) return;
            this.queue.push({
                pos: [posX, posY],
                delta: [0, 0],
                color,
                radius: params.splatRadius,
                vortex: params.vortexOnDown,
            });
            return;
        }

        // ドラッグ-垂直方向左右一対
        if (this.queue.length + 2 > params.MAX_SPLAT) return;

        const speed = Math.sqrt(dx * dx + dy * dy) + 1e-6;
        const intensity = Math.min(speed / params.velocityScale, 1.0);
        const nx = dx / speed;
        const ny = dy / speed;
        const px = -ny; // 垂直方向
        const py =  nx;

        const offset = params.splatRadius * 0.8;
        const delta: [number, number] = [dx * scale, dy * scale];

        const [r,g,b] = color;
        // 左-反時計回り
        this.queue.push({
            pos  : [posX + px * offset, posY + py * offset],
            delta, 
            color : [r * intensity, g * intensity, b * intensity, 1.0],
            radius: params.splatRadius,
            vortex: +params.vortexOnMove,
        });

        // 右-時計回り(符号反転)
        this.queue.push({
            pos  : [posX - px * offset, posY - py * offset],
            delta, 
            color : [r * intensity, g * intensity, b * intensity, 1.0],
            radius: params.splatRadius,
            vortex: -params.vortexOnMove,
        });
    }
}

function hsvToRgba(h: number, s: number, v: number): [number, number, number, number] {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: return [v, t, p, 1];
        case 1: return [q, v, p, 1];
        case 2: return [p, v, t, 1];
        case 3: return [p, q, v, 1];
        case 4: return [t, p, v, 1];
        default: return [v, p, q, 1];
    }
}