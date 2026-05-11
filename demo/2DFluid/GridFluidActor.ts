import { Actor } from "../../core/Actor";
import { GridFluidComponent } from "./GridFluidComponent";
import { GridParamComponent } from "./GridParamComponent";
import type { ISimulatorContext } from "../../core/ISimulatorContext";

// 
export class GridFluidActor extends Actor{
    constructor(
        ctx : ISimulatorContext,
        width : number = 256,
        height : number = 256,
    ){
        super();
        this.addAndRegister(new GridParamComponent(width, height), ctx);
        this.addAndRegister(new GridFluidComponent(), ctx);
    }
}