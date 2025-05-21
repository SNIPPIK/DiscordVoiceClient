"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceAdapter = void 0;
const v10_1 = require("discord-api-types/v10");
class VoiceAdapter {
    adapter;
    packet = {
        server: undefined,
        state: undefined
    };
    sendPayload = (config) => {
        try {
            return this.adapter.sendPayload({ op: v10_1.GatewayOpcodes.VoiceStateUpdate, d: config });
        }
        catch (e) {
            console.error("hook error in adapter", e);
            return false;
        }
    };
}
exports.VoiceAdapter = VoiceAdapter;
