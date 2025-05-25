"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketCloseCodes = exports.ClientWebSocket = void 0;
const voice_1 = require("discord-api-types/voice");
const emitter_1 = require("../emitter");
const ws_1 = require("ws");
class ClientWebSocket extends emitter_1.TypedEmitter {
    endpoint;
    _client;
    heartbeat = {
        interval: null,
        timeout: null,
        intervalMs: null,
        timeoutMs: 5e3,
        reconnects: 0,
        miss: 0
    };
    lastAsk = 0;
    get ready() {
        return !!this._client && this._client?.readyState === ws_1.WebSocket.OPEN;
    }
    ;
    set packet(payload) {
        if (this._client?.readyState && this._client?.readyState === ws_1.WebSocket.OPEN) {
            try {
                this._client.send(JSON.stringify(payload));
            }
            catch (e) {
                this.emit("error", new Error(`${e}`));
            }
        }
    }
    ;
    constructor(endpoint) {
        super();
        this.endpoint = endpoint;
    }
    ;
    connect = () => {
        if (this._client)
            this.destroyWs();
        this._client = new ws_1.WebSocket(this.endpoint, {
            handshakeTimeout: 7e3,
            headers: {
                "User-Agent": "VoiceClient (https://github.com/SNIPPIK/UnTitles/tree/beta/src/services/voice)"
            }
        });
        this._client.on("open", () => this.emit("connect"));
        this._client.on("message", this.onMessage);
        this._client.on("close", this.onClose);
        this._client.on("error", err => this.emit("error", err));
    };
    onMessage = (data) => {
        let payload;
        try {
            payload = JSON.parse(data.toString());
        }
        catch {
            this.emit("error", new Error('Invalid JSON'));
            return;
        }
        const { op, d } = payload;
        switch (op) {
            case voice_1.VoiceOpcodes.Hello: {
                this.manageHeartbeat(d.heartbeat_interval);
                this.heartbeat.intervalMs = d.heartbeat_interval;
                break;
            }
            case voice_1.VoiceOpcodes.HeartbeatAck: {
                this.lastAsk++;
                this.handleHeartbeatAck(d.t);
                break;
            }
            case voice_1.VoiceOpcodes.Resumed: {
                this.heartbeat.reconnects = 0;
                this.manageHeartbeat();
                break;
            }
            case voice_1.VoiceOpcodes.ClientDisconnect: {
                this.emit("disconnect", d.code, d.reason);
                break;
            }
            case voice_1.VoiceOpcodes.Ready: {
                this.emit("packet", payload);
                this.heartbeat.reconnects = 0;
                break;
            }
            default: this.emit("packet", payload);
        }
        this.emit("debug", payload);
    };
    onClose = (code, reason) => {
        const reconnectCodes = [4001];
        const recreateCodes = [1006];
        const exitCodes = [1000, 1001, 4006];
        const ignoreCodes = [4014];
        this.emit("debug", `Close: ${code} - ${reason}`);
        if (recreateCodes.includes(code)) {
            this.attemptReconnect(true);
            return;
        }
        else if (reconnectCodes.includes(code)) {
            this.attemptReconnect();
            return;
        }
        else if (exitCodes.includes(code)) {
            this.emit("close", 1000, reason);
            this.destroy();
            return;
        }
        else if (ignoreCodes.includes(code))
            return;
        this.emit("close", code, reason);
    };
    attemptReconnect = (reconnect) => {
        if (this.heartbeat.interval)
            clearInterval(this.heartbeat.interval);
        if (this.heartbeat.timeout)
            clearTimeout(this.heartbeat.timeout);
        if (reconnect || this.heartbeat.reconnects >= 3) {
            this.emit("debug", `Reconnecting...`);
            this.connect();
            return;
        }
        this.heartbeat.reconnects++;
        const delay = Math.min(1000 * this.heartbeat.reconnects, 5000);
        setTimeout(() => {
            this.emit("debug", `Reconnecting... Attempt ${this.heartbeat.reconnects}`);
            this.emit("request_resume");
        }, delay);
    };
    startHeartbeatTimeout = () => {
        if (this.heartbeat.timeout)
            clearTimeout(this.heartbeat.timeout);
        this.heartbeat.timeout = setTimeout(() => {
            if (this.heartbeat.miss >= 2)
                this.attemptReconnect(false);
            this.emit("warn", "HEARTBEAT_ACK not received within timeout");
            this.heartbeat.miss++;
        }, this.heartbeat.timeoutMs);
    };
    manageHeartbeat(intervalMs) {
        if (this.heartbeat.interval)
            clearInterval(this.heartbeat.interval);
        if (intervalMs !== 0)
            this.heartbeat.intervalMs = intervalMs;
        this.heartbeat.interval = setInterval(() => {
            this.packet = {
                op: voice_1.VoiceOpcodes.Heartbeat,
                d: {
                    t: Date.now(),
                    seq_ack: this.lastAsk
                }
            };
            this.startHeartbeatTimeout();
        }, this.heartbeat.intervalMs);
    }
    ;
    handleHeartbeatAck = (ackData) => {
        this.emit("debug", `HEARTBEAT_ACK received. Latency: ${Date.now() - ackData} ms`);
        this.heartbeat.miss = 0;
        if (this.heartbeat.timeout) {
            clearTimeout(this.heartbeat.timeout);
            this.heartbeat.timeout = null;
        }
    };
    destroyWs = () => {
        this._client?.removeAllListeners();
        if (this.ready) {
            this._client?.close(1000);
            this.emit("close", 1000, "Normal closing");
        }
        this._client?.terminate();
        this._client = null;
    };
    destroy = () => {
        this.destroyWs();
        this.removeAllListeners();
        if (this.heartbeat.timeout)
            clearTimeout(this.heartbeat.timeout);
        if (this.heartbeat.interval)
            clearTimeout(this.heartbeat.interval);
    };
}
exports.ClientWebSocket = ClientWebSocket;
var WebSocketCloseCodes;
(function (WebSocketCloseCodes) {
    WebSocketCloseCodes[WebSocketCloseCodes["NORMAL_CLOSURE"] = 1000] = "NORMAL_CLOSURE";
    WebSocketCloseCodes[WebSocketCloseCodes["GOING_AWAY"] = 1001] = "GOING_AWAY";
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
})(WebSocketCloseCodes || (exports.WebSocketCloseCodes = WebSocketCloseCodes = {}));
