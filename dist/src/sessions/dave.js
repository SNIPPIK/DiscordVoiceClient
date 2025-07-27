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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientDAVE = void 0;
const emitter_1 = require("../emitter");
const index_1 = require("../index");
let DAVE_PROTOCOL_VERSION = 0;
const TRANSITION_EXPIRY = 10;
const TRANSITION_EXPIRY_PENDING_DOWNGRADE = 24;
const DEFAULT_DECRYPTION_FAILURE_TOLERANCE = 36;
class ClientDAVE extends emitter_1.TypedEmitter {
    protocolVersion;
    user_id;
    channel_id;
    lastTransition_id;
    pendingTransition;
    downgraded = false;
    consecutiveFailures = 0;
    failureTolerance = DEFAULT_DECRYPTION_FAILURE_TOLERANCE;
    reinitializing = false;
    session;
    static get version() {
        return DAVE_PROTOCOL_VERSION;
    }
    ;
    set externalSender(externalSender) {
        if (!this.session)
            throw new Error("No session available");
        this.session.setExternalSender(externalSender);
        this.emit("debug", "Set MLS external sender");
    }
    ;
    set prepareEpoch(data) {
        this.emit("debug", `Preparing for epoch (${data.epoch})`);
        if (data.epoch === 1) {
            this.protocolVersion = data.protocol_version;
            this.reinit();
        }
    }
    ;
    constructor(protocolVersion, user_id, channel_id) {
        super();
        this.protocolVersion = protocolVersion;
        this.user_id = user_id;
        this.channel_id = channel_id;
    }
    ;
    reinit = () => {
        if (this.protocolVersion > 0) {
            if (this.session) {
                this.session.reinit(this.protocolVersion, this.user_id, this.channel_id);
                this.emit("debug", `Session reinitialized for protocol version ${this.protocolVersion}`);
            }
            else {
                this.session = new loaded_lib.DAVESession(this.protocolVersion, this.user_id, this.channel_id);
                this.emit("debug", `Session initialized for protocol version ${this.protocolVersion}`);
            }
            this.emit("key", this.session.getSerializedKeyPackage());
        }
        else if (this.session) {
            this.session.reset();
            this.session.setPassthroughMode(true, TRANSITION_EXPIRY);
            this.emit("debug", "Session reset");
        }
    };
    prepareTransition = (data) => {
        this.emit("debug", `Preparing for transition (${data.transition_id}, v${data.protocol_version})`);
        this.pendingTransition = data;
        if (data.transition_id === 0)
            this.executeTransition(data.transition_id);
        else {
            if (data.protocol_version === 0)
                this.session?.setPassthroughMode(true, TRANSITION_EXPIRY_PENDING_DOWNGRADE);
            return true;
        }
        return false;
    };
    executeTransition = (transition_id) => {
        this.emit("debug", `Executing transition (${transition_id})`);
        if (!this.pendingTransition) {
            this.emit("debug", `Received execute transition, but we don't have a pending transition for ${transition_id}`);
            return null;
        }
        let transitioned = false;
        if (transition_id === this.pendingTransition.transition_id) {
            const oldVersion = this.protocolVersion;
            this.protocolVersion = this.pendingTransition.protocol_version;
            if (oldVersion !== this.protocolVersion && this.protocolVersion === 0) {
                this.downgraded = true;
                this.emit("debug", "Session downgraded");
            }
            else if (transition_id > 0 && this.downgraded) {
                this.downgraded = false;
                this.session?.setPassthroughMode(true, TRANSITION_EXPIRY);
                this.emit("debug", "Session upgraded");
            }
            transitioned = true;
            this.reinitializing = false;
            this.lastTransition_id = transition_id;
            this.emit("debug", `Transition executed (v${oldVersion} -> v${this.protocolVersion}, id: ${transition_id})`);
        }
        else {
            this.emit("debug", `Received execute transition for an unexpected transition id (expected: ${this.pendingTransition.transition_id}, actual: ${transition_id})`);
        }
        this.pendingTransition = undefined;
        return transitioned;
    };
    recoverFromInvalidTransition = (transitionId) => {
        if (this.reinitializing)
            return;
        this.emit("debug", `Invalidating transition ${transitionId}`);
        this.reinitializing = true;
        this.consecutiveFailures = 0;
        this.emit("invalidateTransition", transitionId);
        this.reinit();
    };
    processProposals = (payload, connectedClients) => {
        if (!this.session)
            throw new Error("No session available");
        this.emit("debug", "MLS proposals processed");
        const { commit, welcome } = this.session.processProposals(payload.readUInt8(0), payload.subarray(1), Array.from(connectedClients));
        if (!commit)
            return null;
        return welcome ? Buffer.concat([commit, welcome]) : commit;
    };
    processCommit = (payload) => {
        if (!this.session)
            throw new Error("No session available");
        const transition_id = payload.readUInt16BE(0);
        try {
            this.session.processCommit(payload.subarray(2));
            if (transition_id === 0) {
                this.reinitializing = false;
                this.lastTransition_id = transition_id;
            }
            else
                this.pendingTransition = { transition_id, protocol_version: this.protocolVersion };
            this.emit("debug", `MLS commit processed (transition id: ${transition_id})`);
            return { transition_id, success: true };
        }
        catch (error) {
            this.emit("debug", `MLS commit errored from transition ${transition_id}: ${error}`);
            this.recoverFromInvalidTransition(transition_id);
            return { transition_id, success: false };
        }
    };
    processWelcome = (payload) => {
        if (!this.session)
            throw new Error("No session available");
        const transition_id = payload.readUInt16BE(0);
        try {
            this.session.processWelcome(payload.subarray(2));
            if (transition_id === 0) {
                this.reinitializing = false;
                this.lastTransition_id = transition_id;
            }
            else
                this.pendingTransition = { transition_id, protocol_version: this.protocolVersion };
            this.emit("debug", `MLS welcome processed (transition id: ${transition_id})`);
            return { transition_id, success: true };
        }
        catch (error) {
            this.emit("debug", `MLS welcome errored from transition ${transition_id}: ${error}`);
            this.recoverFromInvalidTransition(transition_id);
            return { transition_id, success: false };
        }
    };
    encrypt = (packet) => {
        if (this.protocolVersion === 0 || !this.session?.ready || packet.equals(index_1.SILENT_FRAME))
            return packet;
        return this.session.encryptOpus(packet);
    };
    decrypt = (packet, userId) => {
        const canDecrypt = this.session?.ready && (this.protocolVersion !== 0 || this.session?.canPassthrough(userId));
        if (packet.equals(index_1.SILENT_FRAME) || !canDecrypt || !this.session)
            return packet;
        try {
            const buffer = this.session.decrypt(userId, loaded_lib.MediaType.AUDIO, packet);
            this.consecutiveFailures = 0;
            return buffer;
        }
        catch (error) {
            if (!this.reinitializing && !this.pendingTransition) {
                this.consecutiveFailures++;
                this.emit("debug", `Failed to decrypt a packet (${this.consecutiveFailures} consecutive fails)`);
                if (this.consecutiveFailures > this.failureTolerance) {
                    if (this.lastTransition_id)
                        this.recoverFromInvalidTransition(this.lastTransition_id);
                    else
                        throw error;
                }
            }
            else if (this.reinitializing) {
                this.emit("debug", 'Failed to decrypt a packet (reinitializing session)');
            }
            else if (this.pendingTransition) {
                this.emit("debug", `Failed to decrypt a packet (pending transition ${this.pendingTransition.transition_id} to v${this.pendingTransition.protocol_version})`);
            }
        }
        return null;
    };
    destroy = () => {
        try {
            this.session?.reset();
        }
        catch { }
        this.session = null;
        this.reinitializing = null;
        this.user_id = null;
        this.channel_id = null;
        this.lastTransition_id = null;
        this.pendingTransition = null;
        this.downgraded = null;
        this.pendingTransition = null;
    };
}
exports.ClientDAVE = ClientDAVE;
let loaded_lib = null;
(async () => {
    const names = ["@snazzah/davey"];
    for (const name of names) {
        try {
            const library = await Promise.resolve(`${name}`).then(s => __importStar(require(s)));
            DAVE_PROTOCOL_VERSION = library?.DAVE_PROTOCOL_VERSION;
            loaded_lib = library;
            return;
        }
        catch { }
    }
})();
