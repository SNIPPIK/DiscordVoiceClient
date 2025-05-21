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
        reconnects: 0
    };
    ssrc;
    seq;
    get ready() {
        return !!this._client && this._client.readyState === ws_1.WebSocket.OPEN;
    }
    ;
    set packet(payload) {
        if (this._client.readyState === ws_1.WebSocket.OPEN) {
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
        this.seq = {
            last: 0,
            lastAsk: 0
        };
    }
    ;
    connect = () => {
        if (this._client) {
            this._client.close(1000);
            this._client.terminate();
            this._client.removeAllListeners();
        }
        this._client = new ws_1.WebSocket(this.endpoint, {
            headers: {
                "User-Agent": "VoiceClient WTK Team (https://github.com/SNIPPIK/UnTitles)"
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
        if (payload?.["seq"] !== null)
            this.seq.last = payload["seq"];
        switch (op) {
            case voice_1.VoiceOpcodes.Hello: {
                this.seq.lastAsk++;
                this.manageHeartbeat(d.heartbeat_interval);
                this.heartbeat.intervalMs = d.heartbeat_interval;
                break;
            }
            case voice_1.VoiceOpcodes.HeartbeatAck: {
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
                this.attemptReconnect();
                break;
            }
            case voice_1.VoiceOpcodes.Ready: {
                this.ssrc = d.ssrc;
                this.emit("packet", payload);
                this.heartbeat.reconnects = 0;
                break;
            }
            default: this.emit("packet", payload);
        }
        this.emit("debug", payload);
    };
    onClose = (code, reason) => {
        const error = reason.toString();
        switch (code) {
            case WebSocketCloseCodes.NORMAL_CLOSURE:
            case WebSocketCloseCodes.GOING_AWAY:
                this.emit("debug", `[${code}] WebSocket closed normally.`);
                this.emit("close", 1000, `Closed normally`);
                this.destroy();
                break;
            case WebSocketCloseCodes.DISALLOWED_INTENTS:
                this.emit("debug", `[${code}] Client disconnected.`);
                this.destroy();
                break;
            case WebSocketCloseCodes.UNKNOWN_ERROR:
                this.emit("debug", `[${code}] Unknown error occurred, attempting to reconnect...`);
                this.attemptReconnect();
                break;
            case WebSocketCloseCodes.INVALID_SESSION:
                this.emit("debug", `[${code}] Invalid session, need identification`);
                this.emit("connect");
                break;
            case WebSocketCloseCodes.INSUFFICIENT_RESOURCES:
                this.emit("debug", `[${code}] Voice server crashed. Attempting to reconnect...`);
                this.attemptReconnect(true);
                break;
            case WebSocketCloseCodes.OVERLOADED:
                this.emit("debug", `[${code}] Voice server reboot, attempting to reconnect...`);
                this.attemptReconnect();
                break;
            case WebSocketCloseCodes.NOT_AUTHENTICATED:
                this.emit("debug", `[${code}] Not authenticated, attempting to reconnect...`);
                this.attemptReconnect();
                break;
            default:
                this.emit("debug", `[${code}] Unhandled WebSocket close: ${reason}`);
                this.emit("close", code, error);
                break;
        }
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
    manageHeartbeat(intervalMs) {
        if (this.heartbeat.interval)
            clearInterval(this.heartbeat.interval);
        if (intervalMs)
            this.heartbeat.intervalMs = intervalMs;
        this.heartbeat.interval = setInterval(() => {
            this.packet = {
                op: voice_1.VoiceOpcodes.Heartbeat,
                d: {
                    t: Date.now(),
                    seq_ack: this.seq.lastAsk
                }
            };
            this.startHeartbeatTimeout();
        }, this.heartbeat.intervalMs);
    }
    ;
    handleHeartbeatAck = (ackData) => {
        this.emit("debug", `HEARTBEAT_ACK received. Latency: ${Date.now() - ackData} ms`);
        if (this.heartbeat.timeout) {
            clearTimeout(this.heartbeat.timeout);
            this.heartbeat.timeout = null;
        }
    };
    startHeartbeatTimeout = () => {
        if (this.heartbeat.timeout)
            clearTimeout(this.heartbeat.timeout);
        this.heartbeat.timeout = setTimeout(() => {
            this.emit("warn", "HEARTBEAT_ACK not received within timeout. Reconnecting...");
            this.attemptReconnect();
        }, this.heartbeat.timeoutMs);
    };
    destroy = () => {
        if (this.ready)
            this._client.close(1000);
        this.removeAllListeners();
        this._client.removeAllListeners();
        this._client.terminate();
        this._client = null;
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
    WebSocketCloseCodes[WebSocketCloseCodes["PROTOCOL_ERROR"] = 1002] = "PROTOCOL_ERROR";
    WebSocketCloseCodes[WebSocketCloseCodes["UNSUPPORTED_DATA"] = 1003] = "UNSUPPORTED_DATA";
    WebSocketCloseCodes[WebSocketCloseCodes["RESERVED"] = 1004] = "RESERVED";
    WebSocketCloseCodes[WebSocketCloseCodes["NO_STATUS_RECEIVED"] = 1005] = "NO_STATUS_RECEIVED";
    WebSocketCloseCodes[WebSocketCloseCodes["ABNORMAL_CLOSURE"] = 1006] = "ABNORMAL_CLOSURE";
    WebSocketCloseCodes[WebSocketCloseCodes["INVALID_PAYLOAD"] = 1007] = "INVALID_PAYLOAD";
    WebSocketCloseCodes[WebSocketCloseCodes["POLICY_VIOLATION"] = 1008] = "POLICY_VIOLATION";
    WebSocketCloseCodes[WebSocketCloseCodes["MESSAGE_TOO_BIG"] = 1009] = "MESSAGE_TOO_BIG";
    WebSocketCloseCodes[WebSocketCloseCodes["MISSING_EXTENSION"] = 1010] = "MISSING_EXTENSION";
    WebSocketCloseCodes[WebSocketCloseCodes["INTERNAL_ERROR"] = 1011] = "INTERNAL_ERROR";
    WebSocketCloseCodes[WebSocketCloseCodes["SERVICE_RESTART"] = 1012] = "SERVICE_RESTART";
    WebSocketCloseCodes[WebSocketCloseCodes["TRY_AGAIN_LATER"] = 1013] = "TRY_AGAIN_LATER";
    WebSocketCloseCodes[WebSocketCloseCodes["UNKNOWN_ERROR"] = 4000] = "UNKNOWN_ERROR";
    WebSocketCloseCodes[WebSocketCloseCodes["UNKNOWN_OPCODE"] = 4001] = "UNKNOWN_OPCODE";
    WebSocketCloseCodes[WebSocketCloseCodes["DECODE_ERROR"] = 4002] = "DECODE_ERROR";
    WebSocketCloseCodes[WebSocketCloseCodes["NOT_AUTHENTICATED"] = 4003] = "NOT_AUTHENTICATED";
    WebSocketCloseCodes[WebSocketCloseCodes["AUTHENTICATION_FAILED"] = 4004] = "AUTHENTICATION_FAILED";
    WebSocketCloseCodes[WebSocketCloseCodes["ALREADY_AUTHENTICATED"] = 4005] = "ALREADY_AUTHENTICATED";
    WebSocketCloseCodes[WebSocketCloseCodes["INVALID_SESSION"] = 4006] = "INVALID_SESSION";
    WebSocketCloseCodes[WebSocketCloseCodes["INVALID_SEQ"] = 4007] = "INVALID_SEQ";
    WebSocketCloseCodes[WebSocketCloseCodes["RATE_LIMITED"] = 4008] = "RATE_LIMITED";
    WebSocketCloseCodes[WebSocketCloseCodes["SESSION_TIMEOUT"] = 4009] = "SESSION_TIMEOUT";
    WebSocketCloseCodes[WebSocketCloseCodes["INVALID_SHARD"] = 4010] = "INVALID_SHARD";
    WebSocketCloseCodes[WebSocketCloseCodes["SHARDING_REQUIRED"] = 4011] = "SHARDING_REQUIRED";
    WebSocketCloseCodes[WebSocketCloseCodes["INVALID_VERSION"] = 4012] = "INVALID_VERSION";
    WebSocketCloseCodes[WebSocketCloseCodes["INVALID_INTENTS"] = 4013] = "INVALID_INTENTS";
    WebSocketCloseCodes[WebSocketCloseCodes["DISALLOWED_INTENTS"] = 4014] = "DISALLOWED_INTENTS";
    WebSocketCloseCodes[WebSocketCloseCodes["INSUFFICIENT_RESOURCES"] = 4015] = "INSUFFICIENT_RESOURCES";
    WebSocketCloseCodes[WebSocketCloseCodes["OVERLOADED"] = 4016] = "OVERLOADED";
})(WebSocketCloseCodes || (exports.WebSocketCloseCodes = WebSocketCloseCodes = {}));
