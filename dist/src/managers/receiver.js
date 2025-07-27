"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceReceiver = void 0;
const emitter_1 = require("../emitter");
const AUTH_TAG_LENGTH = 16;
const UNPADDED_NONCE_LENGTH = 4;
const HEADER_EXTENSION_BYTE = Buffer.from([0xbe, 0xde]);
class VoiceReceiver extends emitter_1.TypedEmitter {
    voice;
    ssrc = 0;
    _users;
    constructor(voice) {
        super();
        this.voice = voice;
        voice["websocket"].on("speaking", ({ d }) => {
            this.ssrc = d.ssrc;
        });
        voice["websocket"].on("ClientConnect", ({ d }) => {
            this._users = d.user_ids;
        });
        voice["websocket"].on("ClientDisconnect", ({ d }) => {
            const index = this._users.indexOf(d.user_id);
            if (index !== -1) {
                this._users.splice(index, 1);
            }
        });
        voice["clientUDP"].on("message", (message) => {
            if (message.length <= 8)
                return;
            const ssrc = message.readUInt32BE(8);
            if (this.ssrc === ssrc) {
                message.copy(voice["clientSRTP"]["_nonceBuffer"], 0, message.length - UNPADDED_NONCE_LENGTH);
                const audio = this.parsePacket(message);
                this.emit("speaking", this._users, ssrc, audio);
                return;
            }
        });
    }
    ;
    parsePacket = (buffer) => {
        let headerSize = 12;
        const first = buffer.readUint8();
        if ((first >> 4) & 0x01)
            headerSize += 4;
        const header = buffer.subarray(0, headerSize);
        const encrypted = buffer.subarray(headerSize, buffer.length - AUTH_TAG_LENGTH - UNPADDED_NONCE_LENGTH);
        let packet = this.voice["clientSRTP"].decodeAudioBuffer(header, encrypted, this.voice["clientSRTP"]["_nonce"]);
        if (!packet)
            return null;
        if (buffer.subarray(12, 14).compare(HEADER_EXTENSION_BYTE) === 0) {
            const headerExtensionLength = buffer.subarray(14).readUInt16BE();
            packet = packet.subarray(4 * headerExtensionLength);
        }
        return packet;
    };
}
exports.VoiceReceiver = VoiceReceiver;
