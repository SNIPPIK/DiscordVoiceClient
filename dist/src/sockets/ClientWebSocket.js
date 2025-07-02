"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketCloseCodes = exports.ClientWebSocket = void 0;
const heartbeat_1 = require("../managers/heartbeat");
const voice_1 = require("discord-api-types/voice");
const undici_1 = require("undici");
const emitter_1 = require("../emitter");
class ClientWebSocket extends emitter_1.TypedEmitter {
    endpoint;
    isConnecting;
    heartbeat;
    ws;
    lastAsk = -1;
    get connected() {
        return this.ws?.readyState === undici_1.WebSocket.OPEN || this.ws?.readyState === undici_1.WebSocket.CONNECTING;
    }
    ;
    set packet(payload) {
        this.emit("debug", `[WebSocket/send:]`, payload);
        if (!this.connected)
            return;
        try {
            this.ws.send(JSON.stringify(payload));
        }
        catch (err) {
            if (`${err}`.match(/Cannot read properties of null/)) {
                this.connect(this.endpoint);
                return;
            }
            this.emit("error", err instanceof Error ? err : new Error(String(err)));
        }
    }
    ;
    constructor() {
        super();
        this.heartbeat = new heartbeat_1.HeartbeatManager({
            send: () => {
                this.packet = {
                    op: voice_1.VoiceOpcodes.Heartbeat,
                    d: {
                        t: Date.now(),
                        seq_ack: this.lastAsk
                    }
                };
            },
            onTimeout: () => {
                if (this.heartbeat.missed >= 3) {
                    this.emit("warn", "HEARTBEAT_ACK timeout x3, reconnecting...");
                    this.attemptReconnect();
                }
                else {
                    this.emit("warn", "HEARTBEAT_ACK not received in time");
                }
            },
            onAck: (latency) => {
                this.lastAsk++;
                this.emit("debug", `HEARTBEAT_ACK received. Latency: ${latency} ms`);
            }
        });
    }
    ;
    connect = (endpoint) => {
        if (this.isConnecting)
            return;
        this.isConnecting = true;
        if (this.ws)
            this.reset();
        this.endpoint = endpoint;
        this.ws = new undici_1.WebSocket(`${endpoint}?v=8`);
        this.ws.onmessage = this.onEventMessage;
        this.ws.onopen = () => {
            this.isConnecting = false;
            this.emit("open");
        };
        this.ws.onclose = (ev) => {
            this.isConnecting = false;
            this.onEventClose(ev.code, ev.reason);
        };
        this.ws.onerror = ({ error }) => {
            this.isConnecting = false;
            this.emit("warn", error);
            if (`${error}`.match(/cloused before the connection/)) {
                this.emit("close", 4006, "WebSocket has over destroyed: Repeat!");
                return;
            }
            else if (`${error}`.match(/handshake has timed out/)) {
                this.destroy();
                return;
            }
            this.emit("error", error);
        };
    };
    onEventMessage = (data) => {
        let payload;
        try {
            payload = JSON.parse(data.data.toString());
        }
        catch {
            this.emit("error", new Error('Invalid JSON'));
            return;
        }
        const { op, d } = payload;
        switch (op) {
            case voice_1.VoiceOpcodes.Hello: {
                this.heartbeat.start(d.heartbeat_interval);
                break;
            }
            case voice_1.VoiceOpcodes.HeartbeatAck: {
                this.heartbeat.ack();
                break;
            }
            case voice_1.VoiceOpcodes.Resumed: {
                this.heartbeat.start();
                break;
            }
            case voice_1.VoiceOpcodes.ClientDisconnect: {
                this.emit("disconnect", d.code, d.reason);
                break;
            }
            case voice_1.VoiceOpcodes.Ready: {
                this.emit("ready", payload);
                this.heartbeat.resetReconnects();
                break;
            }
            case voice_1.VoiceOpcodes.SessionDescription: {
                this.emit("sessionDescription", payload);
                break;
            }
        }
        this.emit("debug", `[WebSocket/get:]`, payload);
    };
    onEventClose = (code, reason) => {
        const ignoreCodes = [4014, 4022];
        const notReconnect = [4006, 1000, 1002];
        this.emit("debug", `[WebSocket/close]: ${code} - ${reason}`);
        if (ignoreCodes.includes(code))
            return;
        else if (this.connected && !notReconnect.includes(code)) {
            if (code < 4000 || code === 4015) {
                this.attemptReconnect();
                return;
            }
        }
        this.emit("close", code, reason);
    };
    attemptReconnect = (reconnect) => {
        this.heartbeat.stop();
        if (reconnect || this.heartbeat.reconnectAttempts >= 3) {
            this.emit("debug", `Reconnecting...`);
            this.connect(this.endpoint);
            return;
        }
        this.heartbeat.increaseReconnect();
        const delay = Math.min(1000 * this.heartbeat.reconnectAttempts, 5000);
        setTimeout(() => {
            this.emit("debug", `Reconnecting... Attempt ${this.heartbeat.reconnectAttempts}`);
            this.emit("resumed");
        }, delay);
    };
    reset = () => {
        if (this.ws) {
            this.removeAllListeners();
            if (this.connected)
                this.ws.close(1_000);
        }
        this.ws = null;
        this.lastAsk = 0;
        this.heartbeat.stop();
    };
    destroy = () => {
        this.reset();
        this.lastAsk = null;
    };
}
exports.ClientWebSocket = ClientWebSocket;
var WebSocketCloseCodes;
(function (WebSocketCloseCodes) {
    WebSocketCloseCodes[WebSocketCloseCodes["NORMAL_CLOSURE"] = 1000] = "NORMAL_CLOSURE";
    WebSocketCloseCodes[WebSocketCloseCodes["GOING_AWAY"] = 1001] = "GOING_AWAY";
    WebSocketCloseCodes[WebSocketCloseCodes["EXIT_RESULT"] = 1002] = "EXIT_RESULT";
    WebSocketCloseCodes[WebSocketCloseCodes["ABNORMAL_CLOSURE"] = 1006] = "ABNORMAL_CLOSURE";
    WebSocketCloseCodes[WebSocketCloseCodes["UNKNOWN_OPCODE"] = 4001] = "UNKNOWN_OPCODE";
    WebSocketCloseCodes[WebSocketCloseCodes["DECODE_ERROR"] = 4002] = "DECODE_ERROR";
    WebSocketCloseCodes[WebSocketCloseCodes["NOT_AUTHENTICATED"] = 4003] = "NOT_AUTHENTICATED";
    WebSocketCloseCodes[WebSocketCloseCodes["AUTHENTICATION_FAILED"] = 4004] = "AUTHENTICATION_FAILED";
    WebSocketCloseCodes[WebSocketCloseCodes["ALREADY_AUTHENTICATED"] = 4005] = "ALREADY_AUTHENTICATED";
    WebSocketCloseCodes[WebSocketCloseCodes["INVALID_SESSION"] = 4006] = "INVALID_SESSION";
    WebSocketCloseCodes[WebSocketCloseCodes["SESSION_TIMEOUT"] = 4009] = "SESSION_TIMEOUT";
    WebSocketCloseCodes[WebSocketCloseCodes["SHARDING_REQUIRED"] = 4011] = "SHARDING_REQUIRED";
    WebSocketCloseCodes[WebSocketCloseCodes["INVALID_VERSION"] = 4012] = "INVALID_VERSION";
    WebSocketCloseCodes[WebSocketCloseCodes["DISALLOWED_INTENTS"] = 4014] = "DISALLOWED_INTENTS";
    WebSocketCloseCodes[WebSocketCloseCodes["INSUFFICIENT_RESOURCES"] = 4015] = "INSUFFICIENT_RESOURCES";
    WebSocketCloseCodes[WebSocketCloseCodes["OVERLOADED"] = 4016] = "OVERLOADED";
    WebSocketCloseCodes[WebSocketCloseCodes["BAD_REQUEST"] = 4020] = "BAD_REQUEST";
    WebSocketCloseCodes[WebSocketCloseCodes["Session_Expired"] = 4022] = "Session_Expired";
})(WebSocketCloseCodes || (exports.WebSocketCloseCodes = WebSocketCloseCodes = {}));
