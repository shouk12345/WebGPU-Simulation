import { Actor } from "./Actor";

export abstract class Component{
    private _owner : Actor | null = null;

    get owner() : Actor | null {
        return this._owner;
    }

    set owner(owner : Actor) {
        this._owner = owner;
    }

    Destroy() : void {
        this.onDestroy();
        this._owner = null;
    }

    protected abstract onDestroy() : void;
}