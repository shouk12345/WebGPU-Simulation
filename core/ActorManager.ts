import { Actor, ActorState } from "./Actor";
import { ComponentManager } from "./ComponentManager";

export class ActorManager {
    private readonly _actors : Map<number, Actor> = new Map();

    // アップデート中生成されたActorを臨時保管、次のフレームからアップデート
    private readonly _pendingList : Actor[] = [];
    // アップデート中dead感知されたActorを収集、巡回後一括消滅
    private readonly _deadList : Actor[] = [];

    constructor(private readonly _compMgr : ComponentManager){}

    // actorをpendingListへ追加
    // 次のフレームからactorsへ追加
    add(actor : Actor) : void{
        this._pendingList.push(actor);
    }
    
    // actorをdead状態に変更
    // 実際の消滅はアップデート後であるためアップデート中削除を行っても安全
    Remove(actor: Actor) : void {
        actor.MarkDead();
    }

    //actorの状態によるactorManagerのアップデート
    Flush() : void{
        // dead状態のactor収集
        for(const actor of this._actors.values()){
            if(actor.state == ActorState.Dead)
                this._deadList.push(actor);
        }

        // dead状態のactorを削除
        for(const actor of this._deadList){
            this._compMgr.RemoveAll(actor.ID);
            this._actors.delete(actor.ID);
        }
        this._deadList.length = 0;

        // pendingActorをactorsへ追加
        for(const actor of this._pendingList){
            this._actors.set(actor.ID, actor);
        }
        this._pendingList.length = 0;
    }

    getActive(): Actor[]{
        const result:Actor[]= [];
        for(const actor of this._actors.values()){
            if(actor.state === ActorState.Active) result.push(actor);
        }
        return result;
    }

    getAll(): Actor[] {
        return Array.from(this._actors.values());
    }
    //pendingListを除く、登録されたactorの数
    get count() : number{
        return this._actors.size;
    }
}