import { Actor } from "./Actor";
import { ActorManager } from "./ActorManager";
import { ComponentManager } from "./ComponentManager";
import type { ISystem } from "./ISystem";
import type { IRenderer } from "./IRenderer";
import type { IComputeSystem } from "./IComputeSystem";
import type { ISimulatorContext } from "./ISimulatorContext";
import type { Component } from "./Component";

export class Simulator implements ISimulatorContext {
    private readonly _compMgr : ComponentManager;
    private readonly _actorMgr : ActorManager;

    private _renderer : IRenderer | null = null;
    private _systems : ISystem[] = [];
    private _computeSystems : IComputeSystem[] = [];

    private _rafID : number = 0;
    private _lastTime : number = 0;
    private _isRunning : boolean = false;

    constructor(){
        this._compMgr = new ComponentManager();
        this._actorMgr = new ActorManager(this._compMgr);
    }


    //system及びrendererセット
    setRenderer(r : IRenderer): void {this._renderer = r;}
    addSystem(s : ISystem): void {this._systems.push(s);}
    addComputeSystem(cs : IComputeSystem): void {this._computeSystems.push(cs);}

    //---ISimulatorContext--------------------

    //Actorを登録、登録処理されたActorは収集され次のフレームで登録される
    addActor(actor: Actor) : void{
        this._actorMgr.add(actor);
    }

    //ActorをDead状態へ変換
    //実際の削除は次のフレームで行われる
    RemoveActor(actor: Actor) : void{
        this._actorMgr.Remove(actor);
    }

    //Componentを内部ComponentManagerへ登録
    RegisterComponent(comp :Component) : void{
        this._compMgr.Register(comp);
    }

    //特定タイプのComponentをすべて照会
    getComponents<T extends Component>(type : abstract new (...args:any[]) => T) : T[]{
        return this._compMgr.getAll(type);
    }

    //Active状態のActor目録を照会
    getActiveActor() : Actor[]{
        return this._actorMgr.getActive();
    }

    //IDで特定のActorを照会
    //Deadまたは未登録の場合undefinedを返還
    getActor(id : number) : Actor | undefined{
        return this._actorMgr.getAll().find(a => a.ID === id);
    }

    //


    async init() : Promise<void> {
        const adapter = await navigator.gpu.requestAdapter();
        if(!adapter) throw new Error("WebGPU adapter not found.");

        const device = await adapter.requestDevice({
            requiredLimits: {
            maxStorageBuffersPerShaderStage:
                adapter.limits.maxStorageBuffersPerShaderStage,
            },
        });
        
        for (const cs of this._computeSystems) {
            await cs.init(device);
        }
    
        if (this._renderer) await this._renderer.init(device);
    }    

    Start(): void {
        if (this._isRunning) return;
        this._isRunning = true;
        this._lastTime = performance.now();
        this._rafID = requestAnimationFrame(this._Loop);
    }

    Pause(): void {
        this._isRunning = false;
        cancelAnimationFrame(this._rafID);
    }

    Destroy(): void {
        this.Pause();
        this._systems.forEach(s => s.Destroy());
        this._computeSystems.forEach(cs => cs.Destroy());
        this._renderer?.Destroy();
        Actor.ResetId();
    }
    
    Resize(width: number, height: number): void {
        this._renderer?.Resize(width, height);
    }

    private _Loop = (timestamp : number) : void =>{
        if(!this._isRunning) return;

        const dt = Math.min((timestamp - this._lastTime) / 1000, 0.05);
        this._lastTime = timestamp;

        this._Update(dt);

        this._rafID = requestAnimationFrame(this._Loop);
    }

    private _Update(dt : number) : void {
        for (const s  of this._systems) s.Update(dt);
        for (const cs of this._computeSystems) cs.Update(dt);
        this._renderer?.Render();
        this._actorMgr.Flush();
    }


}