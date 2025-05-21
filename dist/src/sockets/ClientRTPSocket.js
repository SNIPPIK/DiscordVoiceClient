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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientRTPSocket = void 0;
const node_worker_threads_1 = require("node:worker_threads");
const crypto_1 = __importDefault(require("crypto"));
const EncryptionModes = [];
const EncryptionNonce = [];
const MAX_NONCE_SIZE = 2 ** 32 - 1;
const TIMESTAMP_INC = 960;
class ClientRTPSocket {
    options;
    _nonceBuffer = EncryptionNonce[0];
    _nonce = 0;
    sequence;
    timestamp;
    static get mode() {
        return EncryptionModes[0];
    }
    ;
    get nonce() {
        this._nonce++;
        if (this._nonce > MAX_NONCE_SIZE)
            this._nonce = 0;
        this._nonceBuffer.writeUInt32BE(this._nonce, 0);
        return this._nonceBuffer;
    }
    ;
    get rtp_packet() {
        const rtp_packet = Buffer.alloc(12);
        [rtp_packet[0], rtp_packet[1]] = [0x80, 0x78];
        rtp_packet.writeUInt16BE(this.sequence, 2);
        rtp_packet.writeUInt32BE(this.timestamp, 4);
        rtp_packet.writeUInt32BE(this.options.ssrc, 8);
        return rtp_packet;
    }
    ;
    constructor(options) {
        this.options = options;
        this.sequence = this.randomNBit(16);
        this.timestamp = this.randomNBit(32);
    }
    ;
    packet = (packet) => {
        this.sequence++;
        this.timestamp += TIMESTAMP_INC;
        if (this.sequence >= 2 ** 16)
            this.sequence = 0;
        if (this.timestamp >= 2 ** 32)
            this.timestamp = 0;
        return this.crypto(packet);
    };
    crypto = (packet) => {
        const nonceBuffer = this._nonceBuffer.subarray(0, 4);
        const mode = ClientRTPSocket.mode;
        const rtp = this.rtp_packet;
        const nonce = this.nonce;
        if (mode === "aead_aes256_gcm_rtpsize") {
            const cipher = crypto_1.default.createCipheriv("aes-256-gcm", this.options.key, nonce);
            cipher.setAAD(rtp);
            return Buffer.concat([rtp, cipher.update(packet), cipher.final(), cipher.getAuthTag(), nonceBuffer]);
        }
        else if (mode === "aead_xchacha20_poly1305_rtpsize") {
            const cryptoPacket = loaded_lib.crypto_aead_xchacha20poly1305_ietf_encrypt(packet, rtp, nonce, this.options.key);
            return Buffer.concat([rtp, cryptoPacket, nonceBuffer]);
        }
        throw new Error(`[Encryption Error]: Unsupported encryption mode "${mode}".`);
    };
    randomNBit = (bits) => crypto_1.default.randomBytes(Math.ceil(bits / 8)).readUIntBE(0, Math.ceil(bits / 8)) % (2 ** bits);
}
exports.ClientRTPSocket = ClientRTPSocket;
let loaded_lib = {};
(async () => {
    if (!node_worker_threads_1.isMainThread)
        return;
    if (crypto_1.default.getCiphers().includes("aes-256-gcm")) {
        EncryptionModes.push("aead_aes256_gcm_rtpsize");
        EncryptionNonce.push(Buffer.alloc(12));
        return;
    }
    else {
        const support_libs = {
            sodium: (lib) => ({
                crypto_aead_xchacha20poly1305_ietf_encrypt: (plaintext, additionalData, nonce, key) => {
                    return lib.api.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, additionalData, null, nonce, key);
                }
            }),
            "sodium-native": (lib) => ({
                crypto_aead_xchacha20poly1305_ietf_encrypt: (plaintext, additionalData, nonce, key) => {
                    const cipherText = Buffer.alloc(plaintext.length + lib.crypto_aead_xchacha20poly1305_ietf_ABYTES);
                    lib.crypto_aead_xchacha20poly1305_ietf_encrypt(cipherText, plaintext, additionalData, null, nonce, key);
                    return cipherText;
                }
            }),
            "@stablelib/xchacha20poly1305": (lib) => ({
                crypto_aead_xchacha20poly1305_ietf_encrypt(cipherText, additionalData, nonce, key) {
                    const crypto = new lib.XChaCha20Poly1305(key);
                    return crypto.seal(nonce, cipherText, additionalData);
                },
            }),
            "@noble/ciphers/chacha": (lib) => ({
                crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, additionalData, nonce, key) {
                    const chacha = lib.xchacha20poly1305(key, nonce, additionalData);
                    return chacha.encrypt(plaintext);
                },
            })
        }, names = Object.keys(support_libs);
        EncryptionModes.push("aead_xchacha20_poly1305_rtpsize");
        EncryptionNonce.push(Buffer.alloc(24));
        for (const name of names) {
            try {
                const library = await Promise.resolve(`${name}`).then(s => __importStar(require(s)));
                if (typeof library?.ready?.then === "function")
                    await library.ready;
                Object.assign(loaded_lib, support_libs[name](library));
                delete require.cache[require.resolve(name)];
                return;
            }
            catch { }
        }
        throw Error(`[Critical]: No encryption package is installed. Set one to choose from.\n - ${names.join("\n - ")}`);
    }
})();
