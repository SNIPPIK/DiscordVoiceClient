"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceConnection = void 0;
const adapter_1 = require("./adapter");
const receiver_1 = require("./managers/receiver");
const ClientSRTPSocket_1 = require("./sockets/ClientSRTPSocket");
const ClientWebSocket_1 = require("./sockets/ClientWebSocket");
const ClientUDPSocket_1 = require("./sockets/ClientUDPSocket");
const dave_1 = require("./sessions/dave");
const voice_1 = require("discord-api-types/voice");
const KEEP_SWITCH_SPEAKING = 5e3;
class VoiceConnection {
    configuration;
    receiver;
    adapter = new adapter_1.VoiceAdapter();
    websocket = new ClientWebSocket_1.ClientWebSocket();
    clientUDP = new ClientUDPSocket_1.ClientUDPSocket();
    clientSRTP;
    clientDave;
    speakingTimeout = null;
    _speaking = false;
    _clients = new Set();
    _attention = {
        ssrc: null,
        secret_key: null,
    };
    _status;
    get status() {
        return this._status;
    }
    ;
    set packet(frame) {
        if (this._status === VoiceConnectionStatus.ready && frame) {
            this.speaking = true;
            this.resetSpeakingTimeout();
            if (this.clientUDP && this.clientSRTP) {
                const packet = this.clientDave?.encrypt(frame) ?? frame;
                this.clientUDP.packet = this.clientSRTP.packet(packet);
            }
        }
    }
    ;
    get ready() {
        if (this._status !== VoiceConnectionStatus.ready)
            return false;
        else if (!this.clientSRTP && !this.clientUDP)
            return false;
        else if (this.websocket && this.websocket.status !== "connected")
            return false;
        return this.clientUDP.connected;
    }
    ;
    set speaking(speaking) {
        if (this._speaking === speaking)
            return;
        this._speaking = speaking;
        this.websocket.packet = {
            op: voice_1.VoiceOpcodes.Speaking,
            d: {
                speaking: speaking ? 1 : 0,
                delay: 0,
                ssrc: this._attention.ssrc
            },
            seq: this.websocket.sequence
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
        if (!configuration.self_deaf) {
            this.receiver = new receiver_1.VoiceReceiver(this);
        }
    }
    ;
    createWebSocket = (endpoint) => {
        this.websocket.connect(endpoint);
        this.websocket.on("open", () => {
            this.websocket.packet = {
                op: voice_1.VoiceOpcodes.Identify,
                d: {
                    server_id: this.configuration.guild_id,
                    session_id: this.voiceState.session_id,
                    user_id: this.voiceState.user_id,
                    token: this.serverState.token,
                    max_dave_protocol_version: dave_1.ClientDAVE.version
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
            if (dave_1.ClientDAVE.version > 0) {
                this.createDaveSession(d.dave_protocol_version);
            }
            if (this.clientSRTP) {
                this.clientSRTP.destroy();
                this.clientSRTP = null;
            }
            this.clientSRTP = new ClientSRTPSocket_1.ClientSRTPSocket({
                key: new Uint8Array(d.secret_key),
                ssrc: this._attention.ssrc
            });
            this._attention.secret_key = d.secret_key;
            this._status = VoiceConnectionStatus.ready;
        });
        this.websocket.on("resumed", () => {
            this.speaking = false;
            this.websocket.packet = {
                op: voice_1.VoiceOpcodes.Resume,
                d: {
                    server_id: this.configuration.guild_id,
                    session_id: this.voiceState.session_id,
                    token: this.serverState.token,
                    seq_ack: this.websocket.sequence
                }
            };
        });
        this.websocket.on("close", (code, reason) => {
            if (code >= 1000 && code <= 1002 || code === 4002 || this._status === VoiceConnectionStatus.reconnecting)
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
        this.websocket.on("ClientConnect", ({ d }) => {
            for (const id of d.user_ids)
                this._clients.add(id);
        });
        this.websocket.on("ClientDisconnect", ({ d }) => {
            this._clients.delete(d.user_id);
        });
    };
    createUDPSocket = (d) => {
        this.clientUDP.connect(d);
        this.clientUDP.once("connected", ({ ip, port }) => {
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
        this.clientUDP.on("close", () => {
            if (this._status === VoiceConnectionStatus.disconnected)
                return;
            this.createUDPSocket(d);
            this.websocket.emit("warn", `UDP Close. Reinitializing UDP socket...`);
        });
        this.clientUDP.on("error", (error) => {
            if (`${error}`.match(/Not found IPv4 address/)) {
                if (this.disconnect)
                    this.destroy();
                return;
            }
            this.websocket.emit("warn", `UDP Error: ${error.message}. Closed voice connection!`);
        });
        this._attention.ssrc = d.ssrc;
    };
    createDaveSession = (version) => {
        const { user_id, channel_id } = this.adapter.packet.state;
        const session = new dave_1.ClientDAVE(version, user_id, channel_id);
        this.websocket.on("daveSession", ({ op, d }) => {
            if (op === voice_1.VoiceOpcodes.DavePrepareTransition) {
                const sendReady = session.prepareTransition(d);
                if (sendReady)
                    this.websocket.packet = {
                        op: voice_1.VoiceOpcodes.DaveTransitionReady,
                        d: {
                            transition_id: d.transition_id
                        },
                    };
            }
            else if (op === voice_1.VoiceOpcodes.DaveExecuteTransition) {
                session.executeTransition(d.transition_id);
            }
            else if (op === voice_1.VoiceOpcodes.DavePrepareEpoch) {
                session.prepareEpoch = d;
            }
        });
        this.websocket.on("binary", ({ op, payload }) => {
            if (this._status !== VoiceConnectionStatus.ready && !this.clientDave)
                return;
            if (op === voice_1.VoiceOpcodes.DaveMlsExternalSender) {
                this.clientDave.externalSender = payload;
            }
            else if (op === voice_1.VoiceOpcodes.DaveMlsProposals) {
                const dd = this.clientDave.processProposals(payload, this._clients);
                if (dd)
                    this.websocket.packet = Buffer.concat([new Uint8Array([voice_1.VoiceOpcodes.DaveMlsCommitWelcome]), dd]);
            }
            else if (op === voice_1.VoiceOpcodes.DaveMlsAnnounceCommitTransition) {
                const { transition_id, success } = this.clientDave.processCommit(payload);
                if (success) {
                    if (transition_id !== 0)
                        this.websocket.packet = {
                            op: voice_1.VoiceOpcodes.DaveTransitionReady,
                            d: { transition_id },
                        };
                }
            }
            else if (op === voice_1.VoiceOpcodes.DaveMlsWelcome) {
                const { transition_id, success } = this.clientDave.processWelcome(payload);
                if (success) {
                    if (transition_id !== 0)
                        this.websocket.packet = {
                            op: voice_1.VoiceOpcodes.DaveTransitionReady,
                            d: { transition_id },
                        };
                }
            }
        });
        session.on("key", (key) => {
            if (this._status === VoiceConnectionStatus.ready || this._status === VoiceConnectionStatus.SessionDescription) {
                this.websocket.packet = Buffer.concat([new Uint8Array([voice_1.VoiceOpcodes.DaveMlsKeyPackage]), key]);
            }
        });
        session.on("invalidateTransition", (transitionId) => {
            if (this._status === VoiceConnectionStatus.ready || this._status === VoiceConnectionStatus.SessionDescription) {
                this.websocket.packet = {
                    op: voice_1.VoiceOpcodes.DaveMlsInvalidCommitWelcome,
                    d: {
                        transition_id: transitionId
                    },
                };
            }
        });
        session.reinit();
        this.clientDave = session;
    };
    destroy = () => {
        if (this.speakingTimeout)
            clearTimeout(this.speakingTimeout);
        try {
            if (this.websocket && this.clientUDP) {
                this.websocket?.destroy();
                this.clientUDP?.destroy();
                this.clientSRTP?.destroy();
                this.clientDave?.destroy();
            }
        }
        catch { }
        if (this.receiver) {
            this.receiver?.emitDestroy();
            this.receiver = null;
        }
        this.adapter.adapter?.destroy();
        this.clientSRTP = null;
        this.websocket = null;
        this.clientUDP = null;
        this.clientDave = null;
        this.adapter = null;
        this.speakingTimeout = null;
        this._speaking = null;
        this._clients.clear();
        this._clients = null;
        this._status = null;
    };
    resetSpeakingTimeout = () => {
        if (this.speakingTimeout)
            clearTimeout(this.speakingTimeout);
        this.speakingTimeout = setTimeout(() => { this.speaking = false; }, KEEP_SWITCH_SPEAKING);
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
