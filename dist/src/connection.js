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
                ssrc: this.websocket.ssrc
            },
            seq: this.websocket.seq.last
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
    constructor(configuration, adapterCreator) {
        this.configuration = configuration;
        this.adapter.adapter = adapterCreator({
            onVoiceServerUpdate: (packet) => {
                this.adapter.packet.server = packet;
                if (packet.endpoint)
                    this.createClientWebSocket(packet.endpoint);
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
    createUDPSocket = (d) => {
        if (this.udpClient) {
            this.udpClient.destroy();
            this.udpClient = null;
        }
        this.udpClient = new ClientUDPSocket_1.ClientUDPSocket(d);
        this.udpClient.discovery(d.ssrc);
        this.udpClient.on("connected", (options) => {
            this.websocket.packet = {
                op: voice_1.VoiceOpcodes.SelectProtocol,
                d: {
                    protocol: "udp",
                    data: {
                        address: options.ip,
                        port: options.port,
                        mode: ClientRTPSocket_1.ClientRTPSocket.mode
                    }
                }
            };
        });
        this.udpClient.on("error", (error) => {
            this.websocket.emit("warn", `UDP Error: ${error.message}. Reinitializing UDP socket...`);
            this.createUDPSocket(d);
        });
    };
    createClientWebSocket = (endpoint) => {
        if (this.websocket) {
            this.websocket.removeAllListeners();
            this.websocket.destroy();
            this.websocket = null;
        }
        this.websocket = new ClientWebSocket_1.ClientWebSocket(`wss://${endpoint}?v=8`);
        this.websocket.connect();
        this.websocket.on("debug", console.log);
        this.websocket.on("warn", console.log);
        this.websocket.on("request_resume", () => {
            this._speaking = false;
            this.websocket.packet = {
                op: voice_1.VoiceOpcodes.Resume,
                d: {
                    server_id: this.configuration.guild_id,
                    session_id: this.voiceState.session_id,
                    token: this.serverState.token,
                    seq_ack: this.websocket.seq.lastAsk
                }
            };
        });
        this.websocket.on("connect", this.onWSOpen);
        this.websocket.on("packet", this.onWSPacket);
        this.websocket.on("close", this.onWSClose);
    };
    onWSPacket = ({ op, d }) => {
        switch (op) {
            case voice_1.VoiceOpcodes.SessionDescription: {
                if (this.rtpClient)
                    this.rtpClient = null;
                this.rtpClient = new ClientRTPSocket_1.ClientRTPSocket({
                    key: new Uint8Array(d.secret_key),
                    ssrc: this.websocket.ssrc
                });
                break;
            }
            case voice_1.VoiceOpcodes.Ready: {
                this.createUDPSocket(d);
                break;
            }
        }
    };
    onWSClose = (code, reason) => {
        if (code === 1000)
            return;
        this.websocket.emit("debug", `[${code}] ${reason}. Attempting to reconnect...`);
        this.createClientWebSocket(this.adapter.packet.server.endpoint);
    };
    onWSOpen = () => {
        this._speaking = false;
        this.websocket.packet = {
            op: voice_1.VoiceOpcodes.Identify,
            d: {
                server_id: this.configuration.guild_id,
                session_id: this.voiceState.session_id,
                user_id: this.voiceState.user_id,
                token: this.serverState.token
            }
        };
    };
    resetSpeakingTimeout = () => {
        if (this.speakingTimeout)
            clearTimeout(this.speakingTimeout);
        this.speakingTimeout = setTimeout(() => {
            this.speaking = false;
        }, 5e3);
    };
    destroy = () => {
        if (!this.websocket && !this.udpClient)
            return;
        if (this.speakingTimeout)
            clearTimeout(this.speakingTimeout);
        this.websocket.destroy();
        this.udpClient.destroy();
        this.rtpClient = null;
        this.websocket = null;
        this.udpClient = null;
        this.speakingTimeout = null;
        this._speaking = false;
    };
}
exports.VoiceConnection = VoiceConnection;
