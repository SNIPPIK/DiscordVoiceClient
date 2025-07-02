"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceConnection = void 0;
const adapter_1 = require("./adapter");
const ClientWebSocket_1 = require("./sockets/ClientWebSocket");
const ClientUDPSocket_1 = require("./sockets/ClientUDPSocket");
const ClientSRTPSocket_1 = require("./sockets/ClientSRTPSocket");
const voice_1 = require("discord-api-types/voice");
class VoiceConnection {
    configuration;
    adapter = new adapter_1.VoiceAdapter();
    websocket = new ClientWebSocket_1.ClientWebSocket();
    udpClient = new ClientUDPSocket_1.ClientUDPSocket();
    rtpClient;
    speakingTimeout = null;
    _speaking = false;
    _attention = {
        ssrc: null,
        secret_key: null,
    };
    _status;
    get status() {
        return this._status;
    }
    ;
    set packet(packet) {
        if (this._status === VoiceConnectionStatus.ready && packet) {
            this.speaking = true;
            this.resetSpeakingTimeout();
            if (this.udpClient && this.rtpClient) {
                this.udpClient.packet = this.rtpClient.packet(packet);
            }
        }
    }
    ;
    get ready() {
        if (this._status !== VoiceConnectionStatus.ready)
            return false;
        else if (!this.rtpClient && !this.udpClient)
            return false;
        return this.udpClient.connected && this.websocket && this.websocket.connected;
    }
    ;
    set speaking(speaking) {
        if (this._speaking === speaking)
            return;
        this._speaking = speaking;
        this.configuration.self_mute = !speaking;
        this.websocket.packet = {
            op: voice_1.VoiceOpcodes.Speaking,
            d: {
                speaking: speaking ? 1 : 0,
                delay: 0,
                ssrc: this._attention.ssrc
            },
            seq: this.websocket.lastAsk
        };
    }
    ;
    get disconnect() {
        this._status = VoiceConnectionStatus.disconnected;
        this.configuration.channel_id = null;
        return this.adapter.sendPayload(this.configuration);
    }
    ;
    set swapChannel(ID) {
        this.configuration = { ...this.configuration, channel_id: ID };
        this.adapter.sendPayload(this.configuration);
    }
    ;
    get voiceState() {
        return this.adapter.packet.state;
    }
    ;
    get serverState() {
        return this.adapter.packet.server;
    }
    ;
    constructor(configuration, adapterCreator) {
        this.configuration = configuration;
        this.adapter.adapter = adapterCreator({
            onVoiceServerUpdate: (packet) => {
                this.adapter.packet.server = packet;
                if (packet.endpoint)
                    this.createWebSocket(packet.endpoint);
            },
            onVoiceStateUpdate: (packet) => {
                this.adapter.packet.state = packet;
            },
            destroy: this.destroy
        });
        this.adapter.sendPayload(this.configuration);
        this._status = VoiceConnectionStatus.connected;
    }
    ;
    createWebSocket = (endpoint) => {
        this.websocket.connect(`wss://${endpoint}`);
        this.websocket.on("open", () => {
            this.websocket.packet = {
                op: voice_1.VoiceOpcodes.Identify,
                d: {
                    server_id: this.configuration.guild_id,
                    session_id: this.voiceState.session_id,
                    user_id: this.voiceState.user_id,
                    token: this.serverState.token
                }
            };
        });
        this.websocket.on("ready", ({ d }) => {
            this.createUDPSocket(d);
            this.resetSpeakingTimeout();
        });
        this.websocket.on("sessionDescription", ({ d }) => {
            this._status = VoiceConnectionStatus.SessionDescription;
            this.speaking = false;
            if (this.rtpClient) {
                this.rtpClient.destroy();
                this.rtpClient = null;
            }
            this.rtpClient = new ClientSRTPSocket_1.ClientSRTPSocket({
                key: new Uint8Array(d.secret_key),
                ssrc: this._attention.ssrc
            });
            this._status = VoiceConnectionStatus.ready;
            this._attention.secret_key = d.secret_key;
        });
        this.websocket.on("resumed", () => {
            this.speaking = false;
            this.websocket.packet = {
                op: voice_1.VoiceOpcodes.Resume,
                d: {
                    server_id: this.configuration.guild_id,
                    session_id: this.voiceState.session_id,
                    token: this.serverState.token,
                    seq_ack: this.websocket.lastAsk
                }
            };
        });
        this.websocket.on("close", (code, reason) => {
            if (code >= 1000 && code <= 1002 || this._status === VoiceConnectionStatus.reconnecting)
                return this.destroy();
            else if (code === 4006 || code === 4003) {
                this.serverState.endpoint = null;
                this.voiceState.session_id = null;
                this.adapter.sendPayload(this.configuration);
                return;
            }
            this._status = VoiceConnectionStatus.reconnecting;
            setTimeout(() => {
                this.websocket?.emit("debug", `[${code}/${reason}] Voice Connection reconstruct ws... 500 ms`);
                this.createWebSocket(this.serverState.endpoint);
            }, 500);
        });
        this.websocket.on("error", () => {
            this._status = VoiceConnectionStatus.disconnected;
            this.disconnect;
            this.destroy();
        });
    };
    createUDPSocket = (d) => {
        this.udpClient.connect(d);
        this.udpClient.once("connected", ({ ip, port }) => {
            this.websocket.packet = {
                op: voice_1.VoiceOpcodes.SelectProtocol,
                d: {
                    protocol: "udp",
                    data: {
                        address: ip,
                        port: port,
                        mode: ClientSRTPSocket_1.ClientSRTPSocket.mode
                    }
                }
            };
        });
        this.udpClient.on("close", () => {
            if (this._status === VoiceConnectionStatus.disconnected)
                return;
            this.createUDPSocket(d);
            this.websocket.emit("warn", `UDP Close. Reinitializing UDP socket...`);
        });
        this.udpClient.on("error", (error) => {
            if (`${error}`.match(/Not found IPv4 address/)) {
                if (this.disconnect)
                    this.destroy();
                return;
            }
            this.websocket.emit("warn", `UDP Error: ${error.message}. Closed voice connection!`);
        });
        this._attention.ssrc = d.ssrc;
    };
    destroy = () => {
        if (this.speakingTimeout)
            clearTimeout(this.speakingTimeout);
        if (this.websocket && this.udpClient) {
            this.websocket?.destroy();
            this.udpClient?.destroy();
            this.rtpClient?.destroy();
        }
        this._status = VoiceConnectionStatus.disconnected;
        this.rtpClient = null;
        this.websocket = null;
        this.udpClient = null;
        this.speakingTimeout = null;
        this._speaking = null;
    };
    resetSpeakingTimeout = () => {
        if (this.speakingTimeout)
            clearTimeout(this.speakingTimeout);
        this.speakingTimeout = setTimeout(() => { this.speaking = false; }, 2e3);
    };
}
exports.VoiceConnection = VoiceConnection;
var VoiceConnectionStatus;
(function (VoiceConnectionStatus) {
    VoiceConnectionStatus["ready"] = "ready";
    VoiceConnectionStatus["disconnected"] = "disconnected";
    VoiceConnectionStatus["connected"] = "connected";
    VoiceConnectionStatus["SessionDescription"] = "sessionDescription";
    VoiceConnectionStatus["reconnecting"] = "reconnecting";
})(VoiceConnectionStatus || (VoiceConnectionStatus = {}));
