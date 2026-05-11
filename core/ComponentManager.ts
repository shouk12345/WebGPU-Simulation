import { Component } from "./Component";
export class ComponentManager {
    private readonly _byEntity : Map<number, Component[]> = new Map();

    private readonly _byType : Map<Function, Component[]> = new Map();

    // Component登録関数
    Register(comp : Component) : void {
        const entityId = comp.owner!.ID;

        // EntityIdインデックス
        if(!this._byEntity.has(entityId))
            this._byEntity.set(entityId, []);
        this._byEntity.get(entityId)!.push(comp);

        // タイプインデックス,プロトタイプ全体を登録
        this._foreachPrototype(comp, (ctor)=>{
            if(!this._byType.has(ctor)){
                this._byType.set(ctor, []);
            }
            this._byType.get(ctor)!.push(comp);
        });
    }

    getAll<T extends Component>(type: abstract new (...args:any[]) => T) : T[]{
        return (this._byType.get(type) ?? []) as T[];
    }

    RemoveAll(entityId: number) : void{
        const comps = this._byEntity.get(entityId);
        if(!comps) return;

        for(const comp of comps){
            // タイプインデックスからプロトタイプ全体除去
            this._foreachPrototype(comp, (ctor)=>{
                const typeList = this._byType.get(ctor);
                if(typeList){
                    const idx = typeList.indexOf(comp);
                    if(idx !== -1) typeList.splice(idx, 1);
                    if(typeList.length === 0) this._byType.delete(ctor);
                }
            });
            comp.Destroy();
        }

        this._byEntity.delete(entityId);
    }

    private _foreachPrototype(comp : Component, callback : (ctor: Function) => void) : void{
        let ctor = comp.constructor as Function;
        while(ctor && ctor !== Component){
            callback(ctor);
            ctor = Object.getPrototypeOf(ctor) as Function;
        }
    }
}