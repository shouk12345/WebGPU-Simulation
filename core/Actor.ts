import type {Component} from "./Component.ts"
import type { ISimulatorContext } from "./ISimulatorContext.ts";

export const ActorState = {
    Active: "Active",
    Dead : "Dead",
} as const;

export type ActorState = typeof ActorState[keyof typeof ActorState];

export class Actor{
    private static _nextId = 0;

    public readonly ID : number;
    public state : ActorState = ActorState.Active;

    private readonly _components : Map<Function, Component> = new Map();
    
    
    constructor(){
        this.ID = Actor._nextId++;
    }

    MarkDead() : void {
        this.state = ActorState.Dead;
    }

    get isDead() : boolean {
        return this.state == ActorState.Dead;
    }
    // componentをactor内部Mapに追加、ownerとして設定
    addComponent<T extends Component>(comp: T) : T {
        comp.owner = this;
        this._components.set(comp.constructor, comp);
        return comp;
    }

    // componentの追加及びComponentManagerへ登録
    addAndRegister<T extends Component>(comp: T, ctx: ISimulatorContext): T {
        this.addComponent(comp);
        ctx.RegisterComponent(comp);
        return comp;
    }

    // typeでcomponentを照会
    getComponent<T extends Component>(type : abstract new (...args: any[]) => T) : T | undefined{
        return this._components.get(type) as T | undefined;
    } 

    // このActor所有のcomponentをすべて返還
    getAllComponents() : Component[]{
        return Array.from(this._components.values());
    }

    // IDカウンターをリセット、デモ変換時使用
    static ResetId() : void {
        Actor._nextId = 0;
    }
}