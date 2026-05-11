export interface IRenderer{
    init(device : GPUDevice) : Promise<void>;

    Render(): void;

    Resize(width: number, height: number) : void;

    Destroy():void;
}