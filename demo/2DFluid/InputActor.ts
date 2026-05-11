import { Actor } from "../../core/Actor";
import { FluidInputComponent } from "./FluidInputComponent";
import type { ISimulatorContext } from "../../core/ISimulatorContext";

export class InputActor extends Actor{
    constructor(ctx : ISimulatorContext){
        super();
        this.addAndRegister(new FluidInputComponent(ctx), ctx);
    }
}