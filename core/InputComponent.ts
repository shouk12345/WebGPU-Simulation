import { Component } from "./Component";

// InputSystemがバインドするイベント
export interface InputEventBinding {
    type : string;
    handler : EventListener;
    options? : AddEventListenerOptions;
}

// 入力イベントバインドを宣言する抽象Component
// getBindings()でイベントとハンドラーを宣言
// 実際のバインド/アンバインドはシステムが担当
// イベント処理ロジックと状態は具体クラスで定義
export abstract class InputComponent extends Component {
    // バインドするイベントの目録を返還
    abstract getBindings(element : HTMLElement) : InputEventBinding[];
}