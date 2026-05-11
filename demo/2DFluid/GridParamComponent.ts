import { Component } from "../../core/Component";

// 2D流体シミュレーションのパラメータを保有するCompnent
export class GridParamComponent extends Component {
    constructor(
        public readonly width : number = 512,
        public readonly height : number = 512,
        public dissipation : number = 0.996,
        public readonly jacobIter : number = 20,
        public velocityScale : number = 8.0,
        public splatRadius : number = 0.05,
        public curlStrength : number = 3.0,
        public vortexOnDown  : number = 30.0,
        public vortexOnMove  : number = 15.0,
        public MAX_SPLAT : number = 16,
        public minEmitDistance : number = 8.0,
    ){
        super();
    }

    // CPUデータのみであるため、削除処理は特に行わない
    protected onDestroy(): void { }
}