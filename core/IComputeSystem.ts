import type { ISystem } from "./ISystem";

export interface IComputeSystem extends ISystem{

    init(device : GPUDevice) : Promise<void>;
}