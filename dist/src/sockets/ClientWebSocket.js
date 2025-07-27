"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientWebSocket = void 0;
const heartbeat_1 = require("../managers/heartbeat");
const v8_1 = require("discord-api-types/voice/v8");
const ws_1 = require("ws");
const emitter_1 = require("../emitter");
class ClientWebSocket extends emitter_1.TypedEmitter {
    _status = WebSocketStatus.idle;
    _endpoint;
    ws;
    _heartbeat;
    sequence = -1;
    get status() {
        return this._status;
    }
    ;
    set packet(payload) {
        this.emit("debug", `[WebSocket/send:]`, payload);
        if (this._status === "connected") {
            try {
                if (payload instanceof Buffer)
                    this.ws.send(payload);
                else
                    this.ws.send(JSON.stringify(payload));
            }
            catch (err) {
                if (`${err}`.match(/Cannot read properties of null/)) {
                    this.connect(this._endpoint);
                    return;
                }
                this.emit("error", err instanceof Error ? err : new Error(String(err)));
            }
        }
    }
    ;
    constructor() {
        super();
        this._heartbeat = new heartbeat_1.HeartbeatManager({
            send: () => {
                this.packet = {
                    op: v8_1.VoiceOpcodes.Heartbeat,
                    d: {
                        t: Date.now(),
                        seq_ack: this.sequence
                    }
                };
            },
            onTimeout: () => {
                if (this._heartbeat.missed === 3) {
                    this._heartbeat.stop();
                    if (this._status !== "connected") {
                        this.emit("close", 1006, "HEARTBEAT_ACK timeout");
                        this.emit("warn", "HEARTBEAT_ACK timeout x3, reconnecting...");
                    }
                }
                else {
                    this.emit("warn", "HEARTBEAT_ACK not received in time");
                }
            },
            onAck: (latency) => {
                this.emit("warn", `HEARTBEAT_ACK received. Latency: ${latency} ms`);
            }
        });
    }
    ;
    connect = (endpoint) => {
        if (this._status === WebSocketStatus.connecting)
            return;
        this._status = WebSocketStatus.connecting;
        if (this.ws) {
            this.reset();
        }
        this._endpoint = endpoint;
        this.ws = new ws_1.WebSocket(`wss://${endpoint}?v=8`, {
            headers: {
                "User-Agent": "VoiceClient (https://github.com/SNIPPIK/UnTitles/tree/beta/src/services/voice)"
            }
        });
        this.ws.onmessage = this.onReceiveMessage;
        this.ws.onopen = () => {
            this._status = WebSocketStatus.connected;
            this.emit("open");
        };
        this.ws.onclose = (ev) => {
            this._status = WebSocketStatus.closed;
            this.onReceiveClose(ev.code, ev.reason);
        };
        this.ws.onerror = ({ error }) => {
            this._status = WebSocketStatus.reconnecting;
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
    readRawData = (data) => {
        if (data instanceof Buffer || data instanceof ArrayBuffer) {
            const buffer = data instanceof ArrayBuffer ? Buffer.from(data) : data;
            const op = buffer.readUInt8(2);
            const payload = buffer.subarray(3);
            const seq = buffer.readUInt16BE(0);
            if (seq)
                this.sequence = seq;
            this.emit("binary", { op, payload });
            this.emit("debug", `[WebSocket/get:]`, { op, payload });
            return null;
        }
        let payload;
        try {
            payload = JSON.parse(data.toString());
        }
        catch {
            this.emit("error", new Error('Invalid JSON'));
            return null;
        }
        return payload;
    };
    onReceiveMessage = (data) => {
        const payload = this.readRawData(data.data);
        if (!payload)
            return null;
        if ("seq" in payload)
            this.sequence = payload.seq;
        const { op, d } = payload;
        switch (op) {
            case v8_1.VoiceOpcodes.HeartbeatAck: {
                this._heartbeat.ack();
                break;
            }
            case v8_1.VoiceOpcodes.Resumed: {
                this._heartbeat.start();
                break;
            }
            case v8_1.VoiceOpcodes.Hello: {
                this._heartbeat.start(d["heartbeat_interval"]);
                break;
            }
            case v8_1.VoiceOpcodes.Speaking: {
                this.emit("speaking", payload);
                break;
            }
            case v8_1.VoiceOpcodes.ClientsConnect: {
                this.emit("ClientConnect", payload);
                break;
            }
            case v8_1.VoiceOpcodes.ClientDisconnect: {
                this.emit("ClientDisconnect", payload);
                break;
            }
            case v8_1.VoiceOpcodes.Ready: {
                this.emit("ready", payload);
                this._heartbeat.resetReconnects();
                break;
            }
            case v8_1.VoiceOpcodes.SessionDescription: {
                this.emit("sessionDescription", payload);
                break;
            }
            case v8_1.VoiceOpcodes.DaveMlsCommitWelcome:
            case v8_1.VoiceOpcodes.DaveTransitionReady:
            case v8_1.VoiceOpcodes.DaveMlsWelcome:
            case v8_1.VoiceOpcodes.DavePrepareEpoch:
            case v8_1.VoiceOpcodes.DaveMlsKeyPackage:
            case v8_1.VoiceOpcodes.DaveMlsInvalidCommitWelcome:
            case v8_1.VoiceOpcodes.DaveMlsProposals:
            case v8_1.VoiceOpcodes.DaveMlsExternalSender:
            case v8_1.VoiceOpcodes.DaveExecuteTransition:
            case v8_1.VoiceOpcodes.DaveMlsAnnounceCommitTransition:
            case v8_1.VoiceOpcodes.DavePrepareTransition: {
                this.emit("daveSession", payload);
                break;
            }
        }
        this.emit("debug", `[WebSocket/get:]`, payload);
    };
    onReceiveClose = (code, reason) => {
        const ignoreCodes = [4014, 4022];
        const notReconnect = [4006, 1000, 1002];
        this.emit("debug", `[WebSocket/close]: ${code} - ${reason}`);
        if (ignoreCodes.includes(code))
            return;
        else if (this._status === WebSocketStatus.connected && !notReconnect.includes(code)) {
            if (code < 4000 || code === 4015) {
                this.connect(this._endpoint);
                return;
            }
        }
        this.emit("close", code, reason);
    };
    reset = () => {
        if (this.ws) {
            this.removeAllListeners();
            this.ws.close(1_000);
        }
        this.ws = null;
        this._heartbeat.stop();
    };
    destroy = () => {
        this.reset();
        this.sequence = null;
        this._heartbeat.stop();
        this._heartbeat = null;
        this._endpoint = null;
        this._status = null;
    };
}
exports.ClientWebSocket = ClientWebSocket;
var WebSocketStatus;
(function (WebSocketStatus) {
    WebSocketStatus["reconnecting"] = "reconnecting";
    WebSocketStatus["connecting"] = "connecting";
    WebSocketStatus["connected"] = "connected";
    WebSocketStatus["closed"] = "closed";
    WebSocketStatus["idle"] = "idle";
})(WebSocketStatus || (WebSocketStatus = {}));
