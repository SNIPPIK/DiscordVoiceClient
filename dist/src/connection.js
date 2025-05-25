"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceConnection = void 0;
const adapter_1 = require("./adapter");
const ClientWebSocket_1 = require("./sockets/ClientWebSocket");
const ClientUDPSocket_1 = require("./sockets/ClientUDPSocket");
const ClientRTPSocket_1 = require("./sockets/ClientRTPSocket");
const voice_1 = require("discord-api-types/voice");
class VoiceConnection {
    configuration;
    adapter = new adapter_1.VoiceAdapter();
    websocket;
    udpClient;
    rtpClient;
    speakingTimeout = null;
    _speaking = false;
    _attention = {
        ssrc: 0,
        secret_key: null,
    };
    set packet(packet) {
        if (this.udpClient && this.rtpClient) {
            this.speaking = true;
            this.udpClient.packet = this.rtpClient.packet(packet);
            this.resetSpeakingTimeout();
        }
    }
    ;
    get ready() {
        return !!this.rtpClient && !!this.udpClient && !!this.websocket && this.websocket.ready;
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
    get voiceState() {
        return this.adapter.packet.state;
    }
    ;
    get serverState() {
        return this.adapter.packet.server;
    }
    ;
    set ClientRTP(d) {
        if (this.rtpClient) {
            if (d.secret_key === this._attention.secret_key)
                return;
            this.rtpClient = null;
        }
        this.rtpClient = new ClientRTPSocket_1.ClientRTPSocket({
            key: new Uint8Array(d.secret_key),
            ssrc: this._attention.ssrc
        });
        this._attention.secret_key = d.secret_key;
    }
    ;
    set ClientUDP(d) {
        const select_protocol = () => {
            const { ip, port } = this.udpClient._discovery;
            this.websocket.packet = {
                op: voice_1.VoiceOpcodes.SelectProtocol,
                d: {
                    protocol: "udp",
                    data: {
                        address: ip,
                        port: port,
                        mode: ClientRTPSocket_1.ClientRTPSocket.mode
                    }
                }
            };
        };
        if (this.udpClient) {
            this._speaking = false;
            if (d.ssrc === this._attention?.ssrc)
                return;
            this.udpClient.destroy();
            this.udpClient = null;
        }
        this.udpClient = new ClientUDPSocket_1.ClientUDPSocket(d);
        this.udpClient.discovery(d.ssrc);
        this.udpClient.on("connected", select_protocol);
        this.udpClient.on("error", (error) => {
            this.websocket.emit("warn", `UDP Error: ${error.message}. Reinitializing UDP socket...`);
        });
        this._attention.ssrc = d.ssrc;
    }
    ;
    set ClientWS(endpoint) {
        if (this.websocket) {
            this.websocket.removeAllListeners();
            this.websocket.destroy();
            this.websocket = null;
        }
        this.websocket = new ClientWebSocket_1.ClientWebSocket(`wss://${endpoint}?v=8`);
        this.websocket.connect();
        this.websocket.on("debug", console.log);
        this.websocket.on("warn", console.log);
        this.websocket.on("error", (err) => {
            this.websocket.emit("close", 4000, err.name);
        });
        this.websocket.on("packet", ({ op, d }) => {
            switch (op) {
                case voice_1.VoiceOpcodes.SessionDescription: {
                    this.speaking = false;
                    this.ClientRTP = d;
                    break;
                }
                case voice_1.VoiceOpcodes.Ready: {
                    this.ClientUDP = d;
                    this.resetSpeakingTimeout();
                    break;
                }
            }
        });
        this.websocket.on("connect", () => {
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
        this.websocket.on("request_resume", () => {
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
            if (code === 1000)
                return this.destroy();
            this.websocket.emit("debug", `[${code}] ${reason}. Reconstruct...`);
            this.ClientWS = this.serverState.endpoint;
        });
    }
    ;
    constructor(configuration, adapterCreator) {
        this.configuration = configuration;
        this.adapter.adapter = adapterCreator({
            onVoiceServerUpdate: (packet) => {
                this.adapter.packet.server = packet;
                if (packet.endpoint)
                    this.ClientWS = packet.endpoint;
            },
            onVoiceStateUpdate: (packet) => {
                this.adapter.packet.state = packet;
            },
            destroy: this.destroy
        });
        this.adapter.sendPayload(this.configuration);
    }
    ;
    disconnect = () => {
        this.configuration.channel_id = null;
        return this.adapter.sendPayload(this.configuration);
    };
    resetSpeakingTimeout = () => {
        if (this.speakingTimeout)
            clearTimeout(this.speakingTimeout);
        this.speakingTimeout = setTimeout(() => { this.speaking = false; }, 2e3);
    };
    destroy = () => {
        if (this.speakingTimeout)
            clearTimeout(this.speakingTimeout);
        if (this.websocket && this.udpClient) {
            this.websocket?.destroy();
            this.udpClient?.destroy();
        }
        this.rtpClient = null;
        this.websocket = null;
        this.udpClient = null;
        this.speakingTimeout = null;
        this._speaking = false;
    };
}
exports.VoiceConnection = VoiceConnection;
