"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeartbeatManager = void 0;
const timeout = 5e3;
class HeartbeatManager {
    hooks;
    interval;
    timeout;
    lastAckTime = 0;
    lastSentTime = 0;
    misses = 0;
    reconnects = 0;
    intervalMs = 0;
    get latency() {
        return this.lastAckTime - this.lastSentTime;
    }
    ;
    get missed() {
        return this.misses;
    }
    ;
    get reconnectAttempts() {
        return this.reconnects;
    }
    ;
    constructor(hooks) {
        this.hooks = hooks;
    }
    start = (intervalMs) => {
        this.stop();
        if (intervalMs)
            this.intervalMs = intervalMs;
        this.interval = setInterval(() => {
            this.lastSentTime = Date.now();
            this.hooks.send();
            this.setTimeout();
        }, this.intervalMs);
    };
    setTimeout = () => {
        if (this.timeout)
            clearTimeout(this.timeout);
        this.timeout = setTimeout(() => {
            this.misses++;
            this.hooks.onTimeout();
        }, timeout);
    };
    ack = () => {
        this.lastAckTime = Date.now();
        const latency = this.lastAckTime - this.lastSentTime;
        this.misses = 0;
        if (this.timeout)
            clearTimeout(this.timeout);
        this.hooks.onAck(latency);
    };
    stop = () => {
        if (this.interval)
            clearInterval(this.interval);
        if (this.timeout)
            clearTimeout(this.timeout);
        this.interval = undefined;
        this.timeout = undefined;
        this.misses = 0;
    };
    resetReconnects = () => {
        this.reconnects = 0;
    };
    increaseReconnect = () => {
        this.reconnects++;
    };
}
exports.HeartbeatManager = HeartbeatManager;
