"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpusEncoder = exports.SILENT_FRAME = void 0;
const node_stream_1 = require("node:stream");
const OGG_MAGIC = Buffer.from("OggS");
exports.SILENT_FRAME = Buffer.from([0xF8, 0xFF, 0xFE]);
class OpusEncoder extends node_stream_1.Writable {
    _buffer = Buffer.alloc(0);
    _write(chunk, _encoding, callback) {
        this._buffer = Buffer.concat([this._buffer, chunk]);
        this.parseAvailablePages();
        return callback();
    }
    ;
    parseAvailablePages = () => {
        let offset = 0;
        while (offset + 27 <= this._buffer.length) {
            const magic = this._buffer.subarray(offset, offset + 4);
            if (!magic.equals(OGG_MAGIC)) {
                this.emit("error", Error(`capture_pattern is not ${OGG_MAGIC}`));
                break;
            }
            const pageSegments = this._buffer.readUInt8(offset + 26);
            const headerLength = 27 + pageSegments;
            if (offset + headerLength > this._buffer.length)
                break;
            const segmentTable = this._buffer.subarray(offset + 27, offset + 27 + pageSegments);
            const totalSegmentLength = segmentTable.reduce((sum, val) => sum + val, 0);
            const fullPageLength = headerLength + totalSegmentLength;
            if (offset + fullPageLength > this._buffer.length)
                break;
            const payload = this._buffer.subarray(offset + headerLength, offset + fullPageLength);
            this.extractPackets(segmentTable, payload);
            offset += fullPageLength;
        }
        this._buffer = this._buffer.subarray(offset);
    };
    extractPackets = (segmentTable, payload) => {
        let payloadOffset = 0;
        let currentPacket = [];
        for (const segmentLength of segmentTable) {
            const segment = payload.subarray(payloadOffset, payloadOffset + segmentLength);
            currentPacket.push(segment);
            payloadOffset += segmentLength;
            if (segmentLength < 255) {
                const packet = Buffer.concat(currentPacket);
                currentPacket = [];
                const packetHeader = packet.subarray(0, 8).toString();
                if (packetHeader === "OpusHead" || packetHeader === "OpusTags")
                    continue;
                this.emit("frame", packet);
            }
        }
    };
}
exports.OpusEncoder = OpusEncoder;
