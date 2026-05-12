import {Simulator} from "../../core/Simulator";
import {GridFluidActor} from "./GridFluidActor";
import {InputActor} from "./InputActor";
import {InputSystem} from "../../core/InputSystem";
import {GridFluidSystem} from "./GridFluidSystem";
import {FluidRenderer} from "./FluidRenderer";

export async function run2DFluidDemo(
    canvas : HTMLCanvasElement,
    gridWidth : number = 1024,
    gridHeight : number = 1024,
) : Promise<Simulator>{
    const sim = new Simulator();

    // system 登録
    sim.addSystem(new InputSystem(sim, canvas));
    sim.addComputeSystem(new GridFluidSystem(sim));
    sim.setRenderer(new FluidRenderer(canvas, sim));

    // actor 登録
    sim.addActor(new GridFluidActor(sim, gridWidth, gridHeight));
    sim.addActor(new InputActor(sim));

    await sim.init();

    const resize = () => sim.Resize(window.innerWidth, window.innerHeight);
    resize();
    window.addEventListener("resize", resize);

    sim.Start();
    return sim;
}