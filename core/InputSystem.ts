import type {ISystem} from "./ISystem";
import { ISimulatorContext } from "./ISimulatorContext";
import { InputComponent } from "./InputComponent";

// InputComponentをクエリーし、イベントをバインド/アンバインドするシステム
export class InputSystem implements ISystem{
    private readonly _bound = new Map<InputComponent, ReturnType<InputComponent['getBindings']>>();

    constructor(
        private readonly _ctx : ISimulatorContext,
        private readonly _element : HTMLElement,
    ){}

    Update(_dt : number) : void {
        const comps = this._ctx.getComponents(InputComponent);

        // 新たに生成されたコンポーネントのイベントをバインド
        for(const comp of comps){
            if(this._bound.has(comp)) continue;
            const bindings = comp.getBindings(this._element);
            for(const b of bindings){
                this._element.addEventListener(b.type, b.handler, b.options);
            }
            this._bound.set(comp, bindings);
        }

        // 消滅されたコンポネント(owner === null)をアンバインド
        for(const [comp, bindings] of this._bound){
            if(comp.owner !== null) continue;
            for(const b of bindings){
                this._element.removeEventListener(b.type, b.handler, b.options);
            }
            this._bound.delete(comp);
        }
    }

    // すべてのイベントをアンバインド
    Destroy(): void {
        for(const bindings of this._bound.values()){
            for(const b of bindings){
                this._element.removeEventListener(b.type, b.handler, b.options);
            }
        }
        this._bound.clear();
    }
}
