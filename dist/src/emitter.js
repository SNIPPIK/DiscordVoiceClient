"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypedEmitter = void 0;
const node_events_1 = require("node:events");
class TypedEmitter extends node_events_1.EventEmitterAsyncResource {
    constructor() {
        super();
        this.setMaxListeners(5);
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    ;
    once(event, listener) {
        return super.once(event, listener);
    }
    ;
    emit(event, ...args) {
        return super.emit(event, ...args);
    }
    ;
    off(event, listener) {
        return super.off(event, listener);
    }
    ;
    removeListener(event, listener) {
        return super.removeListener(event, listener);
    }
    ;
}
exports.TypedEmitter = TypedEmitter;
