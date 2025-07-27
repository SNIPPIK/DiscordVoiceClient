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
exports.ClientSRTPSocket = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const Encryption = {
    name: null,
    nonce: null
};
const TIMESTAMP_INC = 960;
const MAX_16BIT = 2 ** 16;
const MAX_32BIT = 2 ** 32;
class ClientSRTPSocket {
    options;
    _RTP_HEAD = Buffer.allocUnsafe(12);
    _nonce = Buffer.from(Encryption.nonce);
    _nonceSize;
    sequence;
    timestamp;
    static get mode() {
        return Encryption.name;
    }
    ;
    get nonceSize() {
        if (this._nonceSize > MAX_32BIT)
            this._nonceSize = 0;
        this._nonce.writeUInt32BE(this._nonceSize, 0);
        this._nonceSize++;
        return this._nonce;
    }
    ;
    get header() {
        if (this.sequence > MAX_16BIT)
            this.sequence = 0;
        if (this.timestamp > MAX_32BIT)
            this.timestamp = 0;
        const RTPHead = this._RTP_HEAD;
        RTPHead.writeUInt16BE(this.sequence, 2);
        this.sequence = (this.sequence + 1) & 0xFFFF;
        RTPHead.writeUInt32BE(this.timestamp, 4);
        this.timestamp = (this.timestamp + TIMESTAMP_INC) >>> 0;
        RTPHead.writeUInt32BE(this.options.ssrc, 8);
        return RTPHead;
    }
    ;
    constructor(options) {
        this.options = options;
        this.sequence = this.randomNBit(16);
        this.timestamp = this.randomNBit(32);
        this._nonceSize = this.randomNBit(32);
        [this._RTP_HEAD[0], this._RTP_HEAD[1]] = [0x80, 0x78];
    }
    ;
    packet = (frame) => {
        const RTPHead = this.header;
        const nonce = this.nonceSize;
        return this.decodeAudioBuffer(RTPHead, frame, nonce);
    };
    decodeAudioBuffer = (RTPHead, packet, nonce) => {
        const mode = ClientSRTPSocket.mode;
        if (!nonce)
            nonce = this.nonceSize;
        const nonceBuffer = nonce.subarray(0, 4);
        if (mode === "aead_aes256_gcm_rtpsize") {
            const cipher = node_crypto_1.default.createCipheriv("aes-256-gcm", this.options.key, nonce, { authTagLength: 16 });
            cipher.setAAD(RTPHead);
            return Buffer.concat([RTPHead, cipher.update(packet), cipher.final(), cipher.getAuthTag(), nonceBuffer]);
        }
        else if (mode === "aead_xchacha20_poly1305_rtpsize") {
            const cryptoPacket = loaded_lib.crypto_aead_xchacha20poly1305_ietf_encrypt(packet, RTPHead, nonce, this.options.key);
            return Buffer.concat([RTPHead, cryptoPacket, nonceBuffer]);
        }
        throw new Error(`[Encryption Error]: Unsupported encryption mode "${mode}".`);
    };
    randomNBit = (bits) => {
        const max = 2 ** bits;
        const size = Math.ceil(bits / 8);
        const maxGenerated = 2 ** (size * 8);
        let rand;
        do {
            rand = node_crypto_1.default.randomBytes(size).readUIntBE(0, size);
        } while (rand >= maxGenerated - (maxGenerated % max));
        return rand % max;
    };
    destroy = () => {
        this._nonceSize = null;
        this._nonce = null;
        this.timestamp = null;
        this.sequence = null;
        this.options = null;
        this._RTP_HEAD = null;
    };
}
exports.ClientSRTPSocket = ClientSRTPSocket;
let loaded_lib = {};
(async () => {
    if (node_crypto_1.default.getCiphers().includes("aes-256-gcm")) {
        Encryption.name = "aead_aes256_gcm_rtpsize";
        Encryption.nonce = Buffer.alloc(12);
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
        Encryption.name = "aead_xchacha20_poly1305_rtpsize";
        Encryption.nonce = Buffer.alloc(24);
        for await (const name of names) {
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
