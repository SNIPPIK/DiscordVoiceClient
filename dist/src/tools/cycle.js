"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncCycle = void 0;
class BaseCycle extends Set {
    startTime = 0;
    loop = 0;
    missCounter = 0;
    timer;
    get time() {
        if (this.timer === "low")
            return Date.now();
        return performance.now();
    }
    ;
    constructor(duration) {
        super();
        this.timer = duration < 100 ? "max" : "low";
    }
    ;
    add(item) {
        const existing = this.has(item);
        if (existing)
            this.delete(item);
        super.add(item);
        if (this.size === 1 && this.startTime === 0) {
            this.startTime = this.time;
            setImmediate(this._stepCycle);
        }
        return this;
    }
    ;
    _stepCheckTimeCycle = (duration) => {
        if (this.size === 0) {
            this.startTime = 0;
            this.loop = 0;
            this.missCounter = 0;
            return;
        }
        const nextTime = this.startTime + (this.loop * duration);
        const delay = Math.max(0, nextTime - this.time);
        this.loop++;
        if (delay <= 0) {
            setImmediate(this._stepCycle);
            return;
        }
        else if (this.missCounter > 5) {
            this.startTime = this.time;
            this.loop = 0;
            this.missCounter = 0;
            setTimeout(this._stepCycle, duration);
            return;
        }
        setTimeout(() => {
            if (this.timer === "max") {
                const drift = this.time - nextTime;
                if (drift > 5) {
                    this.missCounter++;
                }
            }
            return this._stepCycle();
        }, delay);
    };
}
class SyncCycle extends BaseCycle {
    options;
    constructor(options) {
        super(options.duration);
        this.options = options;
    }
    ;
    add = (item) => {
        if (this.options.custom?.push)
            this.options.custom?.push(item);
        else if (this.has(item))
            this.delete(item);
        super.add(item);
        return this;
    };
    delete = (item) => {
        const index = this.has(item);
        if (index) {
            if (this.options.custom?.remove)
                this.options.custom.remove(item);
            super.delete(item);
        }
        return true;
    };
    _stepCycle = async () => {
        for await (const item of this) {
            if (!this.options.filter(item))
                continue;
            try {
                this.options.execute(item);
            }
            catch (error) {
                this.delete(item);
                console.log(error);
            }
        }
        return this._stepCheckTimeCycle(this.options.duration);
    };
}
exports.SyncCycle = SyncCycle;
