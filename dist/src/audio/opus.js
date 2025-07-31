"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipeEncoder = exports.BufferedEncoder = exports.OPUS_FRAME_SIZE = exports.SILENT_FRAME = void 0;
const node_stream_1 = require("node:stream");
const emitter_1 = require("../emitter");
const OGG_MAGIC = Buffer.from("OggS");
exports.SILENT_FRAME = Buffer.from([0xF8, 0xFF, 0xFE]);
exports.OPUS_FRAME_SIZE = 20;
const EMPTY_FRAME = Buffer.alloc(4);
class BaseEncoder extends emitter_1.TypedEmitter {
    _first = true;
    _buffer = EMPTY_FRAME;
    parseAvailablePages = (chunk) => {
        this._buffer = Buffer.concat([this._buffer, chunk]);
        let offset = 0;
        while (offset + 27 <= this._buffer.length) {
            if (!this._buffer.subarray(offset, offset + 4).equals(OGG_MAGIC)) {
                const next = this._buffer.indexOf(OGG_MAGIC, offset + 1);
                if (next === -1)
                    break;
                offset = next;
                continue;
            }
            if (offset + 27 > this._buffer.length)
                break;
            const pageSegments = this._buffer.readUInt8(offset + 26);
            const segmentTableEnd = offset + 27 + pageSegments;
            if (segmentTableEnd > this._buffer.length)
                break;
            const segmentTable = this._buffer.subarray(offset + 27, segmentTableEnd);
            const totalSegmentLength = segmentTable.reduce((a, b) => a + b, 0);
            const fullPageEnd = segmentTableEnd + totalSegmentLength;
            if (fullPageEnd > this._buffer.length)
                break;
            const payload = this._buffer.subarray(segmentTableEnd, fullPageEnd);
            this._extractPackets(segmentTable, payload);
            offset = fullPageEnd;
        }
        if (offset > 0)
            this._buffer = this._buffer.subarray(offset);
    };
    _extractPackets = (segmentTable, payload) => {
        let currentPacket = [], payloadOffset = 0;
        for (const segmentLength of segmentTable) {
            const segment = payload.subarray(payloadOffset, payloadOffset + segmentLength);
            currentPacket.push(segment);
            payloadOffset += segmentLength;
            if (segmentLength < 255) {
                const packet = Buffer.concat(currentPacket);
                currentPacket = [];
                if (isOpusHead(packet)) {
                    this.emit("head", segment);
                    continue;
                }
                else if (isOpusTags(packet)) {
                    this.emit("tags", segment);
                    continue;
                }
                this._choiceFrame(packet);
            }
        }
    };
    _choiceFrame = (frame) => {
        if (this._first) {
            this.emit("frame", exports.SILENT_FRAME);
            this._first = false;
        }
        this.emit("frame", frame);
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
