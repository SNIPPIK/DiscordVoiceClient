"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayCloseCodes = exports.Voices = void 0;
const connection_1 = require("./connection");
__exportStar(require("./sockets/ClientWebSocket"), exports);
__exportStar(require("./sockets/ClientUDPSocket"), exports);
__exportStar(require("./sockets/ClientSRTPSocket"), exports);
__exportStar(require("./audio/resource"), exports);
__exportStar(require("./audio/process"), exports);
__exportStar(require("./audio/opus"), exports);
__exportStar(require("./connection"), exports);
class Voices extends Map {
    join = (config, adapterCreator) => {
        let connection = this.get(config.guild_id);
        if (!connection) {
            connection = new connection_1.VoiceConnection(config, adapterCreator);
            this.set(config.guild_id, connection);
        }
        else if (!connection.ready || connection.status === "disconnected") {
            this.delete(config.guild_id);
            connection = new connection_1.VoiceConnection(config, adapterCreator);
            this.set(config.guild_id, connection);
        }
        return connection;
    };
}
exports.Voices = Voices;
var GatewayCloseCodes;
(function (GatewayCloseCodes) {
    GatewayCloseCodes[GatewayCloseCodes["NORMAL_CLOSURE"] = 1000] = "NORMAL_CLOSURE";
    GatewayCloseCodes[GatewayCloseCodes["GOING_AWAY"] = 1001] = "GOING_AWAY";
    GatewayCloseCodes[GatewayCloseCodes["EXIT_RESULT"] = 1002] = "EXIT_RESULT";
    GatewayCloseCodes[GatewayCloseCodes["ABNORMAL_CLOSURE"] = 1006] = "ABNORMAL_CLOSURE";
    GatewayCloseCodes[GatewayCloseCodes["UNKNOWN_ERROR"] = 4000] = "UNKNOWN_ERROR";
    GatewayCloseCodes[GatewayCloseCodes["UNKNOWN_OPCODE"] = 4001] = "UNKNOWN_OPCODE";
    GatewayCloseCodes[GatewayCloseCodes["DECODE_ERROR"] = 4002] = "DECODE_ERROR";
    GatewayCloseCodes[GatewayCloseCodes["NOT_AUTHENTICATED"] = 4003] = "NOT_AUTHENTICATED";
    GatewayCloseCodes[GatewayCloseCodes["AUTHENTICATION_FAILED"] = 4004] = "AUTHENTICATION_FAILED";
    GatewayCloseCodes[GatewayCloseCodes["ALREADY_AUTHENTICATED"] = 4005] = "ALREADY_AUTHENTICATED";
    GatewayCloseCodes[GatewayCloseCodes["INVALID_SESSION"] = 4006] = "INVALID_SESSION";
    GatewayCloseCodes[GatewayCloseCodes["INVALID_SEQ"] = 4007] = "INVALID_SEQ";
    GatewayCloseCodes[GatewayCloseCodes["RATE_LIMITED"] = 4008] = "RATE_LIMITED";
    GatewayCloseCodes[GatewayCloseCodes["SESSION_TIMEOUT"] = 4009] = "SESSION_TIMEOUT";
    GatewayCloseCodes[GatewayCloseCodes["INVALID_SHARD"] = 4010] = "INVALID_SHARD";
    GatewayCloseCodes[GatewayCloseCodes["SHARDING_REQUIRED"] = 4011] = "SHARDING_REQUIRED";
    GatewayCloseCodes[GatewayCloseCodes["INVALID_API_VERSION"] = 4012] = "INVALID_API_VERSION";
    GatewayCloseCodes[GatewayCloseCodes["INVALID_INTENTS"] = 4013] = "INVALID_INTENTS";
    GatewayCloseCodes[GatewayCloseCodes["DISALLOWED_INTENTS"] = 4014] = "DISALLOWED_INTENTS";
    GatewayCloseCodes[GatewayCloseCodes["INSUFFICIENT_RESOURCES"] = 4015] = "INSUFFICIENT_RESOURCES";
    GatewayCloseCodes[GatewayCloseCodes["OVERLOADED"] = 4016] = "OVERLOADED";
    GatewayCloseCodes[GatewayCloseCodes["BAD_REQUEST"] = 4020] = "BAD_REQUEST";
    GatewayCloseCodes[GatewayCloseCodes["SESSION_EXPIRED"] = 4022] = "SESSION_EXPIRED";
})(GatewayCloseCodes || (exports.GatewayCloseCodes = GatewayCloseCodes = {}));
