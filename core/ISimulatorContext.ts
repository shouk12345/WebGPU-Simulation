import { Actor } from "./Actor";
import { Component } from "./Component";

// 上位レイヤーからシミュレータに接近するためのFacadeインタフェース
export interface ISimulatorContext{
    //Actorを登録、登録処理されたActorは収集され次のフレームで登録される
    addActor(actor: Actor) : void;

    //ActorをDead状態へ変換
    //実際の削除は次のフレームで行われる
    RemoveActor(actor: Actor) : void;

    //Componentを内部ComponentManagerへ登録
    RegisterComponent(comp :Component) : void;

    //特定タイプのComponentをすべて照会
    getComponents<T extends Component>(type : abstract new (...args:any[]) => T) : T[];

    //Active状態のActor目録を照会
    getActiveActor() : Actor[];

    //IDで特定のActorを照会
    //Deadまたは未登録の場合undefinedを返還
    getActor(id : number) : Actor | undefined;
}