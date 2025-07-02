"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipeEncoder = exports.BufferedEncoder = exports.OPUS_FRAME_SIZE = exports.SILENT_FRAME = void 0;
const node_stream_1 = require("node:stream");
const emitter_1 = require("../emitter");
const OGG_MAGIC = Buffer.from("OggS");
exports.SILENT_FRAME = Buffer.from([0xF8, 0xFF, 0xFE]);
exports.OPUS_FRAME_SIZE = 20;
const EMPTY_FRAME = Buffer.alloc(0);
class BaseEncoder extends emitter_1.TypedEmitter {
    _head_found = false;
    _tags_found = false;
    _first = true;
    _buffer = EMPTY_FRAME;
    parseAvailablePages = (chunk) => {
        this._buffer = Buffer.concat([this._buffer, chunk]);
        const size = this._buffer.length;
        let offset = 0;
        while (offset + 27 <= size) {
            const magic = this._buffer.subarray(offset, offset + 4);
            if (!magic.equals(OGG_MAGIC)) {
                this.emit("error", Error(`capture_pattern is not ${OGG_MAGIC}`));
                break;
            }
            const pageSegments = this._buffer.readUInt8(offset + 26);
            const headerLength = pageSegments + 27;
            if (offset + headerLength > size)
                break;
            const segmentOffset = offset + 27;
            const segmentTable = this._buffer.subarray(segmentOffset, segmentOffset + pageSegments);
            const totalSegmentLength = segmentTable.reduce((sum, val) => sum + val, 0);
            const fullPageLength = headerLength + totalSegmentLength;
            if (offset + fullPageLength > size)
                break;
            const payload = this._buffer.subarray(offset + headerLength, offset + fullPageLength);
            this.extractPackets(segmentTable, payload);
            offset += fullPageLength;
        }
        this._buffer = this._buffer.subarray(offset);
    };
    extractPackets = (segmentTable, payload) => {
        let currentPacket = [], payloadOffset = 0;
        for (const segmentLength of segmentTable) {
            const segment = payload.subarray(payloadOffset, payloadOffset + segmentLength);
            currentPacket.push(segment);
            payloadOffset += segmentLength;
            if (segmentLength < 255) {
                const packet = Buffer.concat(currentPacket);
                currentPacket = [];
                if (packet.length < 5)
                    continue;
                else if (!this._head_found) {
                    if (isOpusHead(packet)) {
                        this._head_found = true;
                        this.emit("head", segment);
                        continue;
                    }
                }
                else if (!this._tags_found) {
                    if (isOpusTags(packet)) {
                        this._tags_found = true;
                        this.emit("tags", segment);
                        continue;
                    }
                }
                if (this._first) {
                    this.emit("frame", exports.SILENT_FRAME);
                    this._first = false;
                }
                this.emit("frame", packet);
            }
        }
    };
    emitDestroy() {
        this.emit("frame", exports.SILENT_FRAME);
        this._first = null;
        this._buffer = null;
        super.emitDestroy();
        this.removeAllListeners();
    }
    ;
}
class BufferedEncoder extends node_stream_1.Writable {
    encoder = new BaseEncoder();
    constructor(options = { autoDestroy: true }) {
        super(options);
        this.encoder.on("head", this.emit.bind(this, "head"));
        this.encoder.on("tags", this.emit.bind(this, "tags"));
        this.encoder.on("frame", this.emit.bind(this, "frame"));
    }
    ;
    _write(chunk, _encoding, callback) {
        this.encoder.parseAvailablePages(chunk);
        return callback();
    }
    ;
    _destroy(error, callback) {
        this.encoder.emitDestroy();
        this.encoder = null;
        super._destroy(error, callback);
        this.removeAllListeners();
    }
    ;
}
exports.BufferedEncoder = BufferedEncoder;
class PipeEncoder extends node_stream_1.Transform {
    encoder = new BaseEncoder();
    constructor(options = { autoDestroy: true }) {
        super(Object.assign(options, { readableObjectMode: true }));
        this.encoder.on("head", this.emit.bind(this, "head"));
        this.encoder.on("tags", this.emit.bind(this, "tags"));
        this.encoder.on("frame", this.push.bind(this));
    }
    ;
    _transform = (chunk, _, done) => {
        this.encoder.parseAvailablePages(chunk);
        return done();
    };
    _destroy(error, callback) {
        this.encoder.emitDestroy();
        this.encoder = null;
        super._destroy(error, callback);
        this.removeAllListeners();
    }
    ;
}
exports.PipeEncoder = PipeEncoder;
function isOpusHead(packet) {
    return (packet.length >= 8 &&
        packet[4] === 0x48 &&
        packet[5] === 0x65 &&
        packet[6] === 0x61 &&
        packet[7] === 0x64);
}
function isOpusTags(packet) {
    return (packet.length >= 8 &&
        packet[4] === 0x54 &&
        packet[5] === 0x61 &&
        packet[6] === 0x67 &&
        packet[7] === 0x73);
}
