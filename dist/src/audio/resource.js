"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipeAudioResource = exports.BufferedAudioResource = void 0;
const opus_1 = require("./opus");
const emitter_1 = require("../emitter");
const process_1 = require("./process");
class AudioBuffer {
    _chunks = new Array();
    _position = 0;
    get size() {
        return this._chunks.length;
    }
    ;
    get position() {
        return this._position;
    }
    ;
    set position(position) {
        if (position > this.size || position < 0)
            return;
        this._position = position;
    }
    ;
    set packet(chunk) {
        this._chunks.push(chunk);
    }
    ;
    get packet() {
        if (this._position >= this.size)
            return null;
        const frame = this._chunks[this._position++];
        return frame ?? opus_1.SILENT_FRAME;
    }
    ;
    clear = () => {
        this._chunks.length = 0;
        this._position = null;
    };
}
class BaseAudioResource extends emitter_1.TypedEmitter {
    _readable = false;
    _seek = 0;
    get readable() {
        return this._readable;
    }
    ;
    get duration() {
        return 0;
    }
    ;
    get packet() {
        return opus_1.SILENT_FRAME;
    }
    ;
    get packets() {
        return 0;
    }
    ;
    constructor({ options }) {
        super();
        if (options?.seek > 0)
            this._seek = (options.seek * 1e3) / opus_1.OPUS_FRAME_SIZE;
    }
    ;
    input(options) {
        for (const event of options.events.destroy) {
            const path = options.events.path ? options.input[options.events.path] : options.input;
            path["once"](event, (err) => {
                if (event === "error")
                    this.emit("error", new Error(`AudioResource get ${err}`));
                options.events.destroy_callback(options.input);
            });
        }
        this.once("close", options.events.destroy_callback.bind(this, options.input));
        return options.decode(options.input);
    }
    ;
    _destroy = () => {
        this.emit("close");
        this.removeAllListeners();
        this._readable = null;
        this._seek = null;
    };
}
class BufferedAudioResource extends BaseAudioResource {
    config;
    _buffer = new AudioBuffer();
    get readable() {
        return this._buffer.position !== this._buffer.size;
    }
    ;
    get duration() {
        if (!this._buffer.position)
            return 0;
        return Math.abs((((this._buffer.position + this._seek) * opus_1.OPUS_FRAME_SIZE) / 1e3));
    }
    ;
    get packet() {
        return this._buffer.packet;
    }
    ;
    get packets() {
        return this._buffer.size - this._buffer.position;
    }
    ;
    constructor(config) {
        super(config);
        this.config = config;
        const { path, options } = config;
        const decoder = new opus_1.BufferedEncoder({
            highWaterMark: 512 * 5
        });
        this.input({
            input: decoder,
            events: {
                destroy: ["end", "close", "error"],
                destroy_callback: (input) => {
                    if (input)
                        input.destroy();
                    this.emit("end");
                }
            },
            decode: (input) => {
                const timeout = setTimeout(() => {
                    this.emit("error", new Error("Timeout: the stream has been exceeded!"));
                    this.emit("close");
                }, 15e3);
                input.on("frame", (packet) => {
                    if (this._buffer.size === 0) {
                        clearTimeout(timeout);
                        this.emit("readable");
                    }
                    this._buffer.packet = packet;
                });
            }
        });
        this.input({
            input: new process_1.Process([
                "-ss", `${options.seek ?? 0}`,
                "-i", path,
                "-af", options.filters,
                "-acodec", "libopus",
                "-frame_duration", "20",
                "-f", "opus",
                "pipe:"
            ]),
            events: {
                path: "stdout",
                destroy: ["end", "close", "error"],
                destroy_callback: (input) => {
                    if (input)
                        input.destroy();
                    this.emit("end");
                },
            },
            decode: (input) => {
                input.stdout.pipe(decoder);
            },
        });
    }
    ;
    refresh = () => {
        this._seek = 0;
        this._buffer.position = 0;
    };
    destroy = () => {
        this._buffer.clear();
        this._destroy();
    };
}
exports.BufferedAudioResource = BufferedAudioResource;
class PipeAudioResource extends BaseAudioResource {
    encoder = new opus_1.PipeEncoder({
        highWaterMark: 512 * 5
    });
    played = 0;
    get packet() {
        const packet = this.encoder.read();
        if (packet)
            this.played++;
        return packet;
    }
    ;
    get packets() {
        return this.encoder.writableLength / opus_1.OPUS_FRAME_SIZE;
    }
    ;
    get duration() {
        return (this._seek + this.played * opus_1.OPUS_FRAME_SIZE) / 1e3;
    }
    ;
    constructor(config) {
        super(config);
        const { path, options } = config;
        this.input({
            input: this.encoder,
            events: {
                destroy: ["end", "close", "error"],
                destroy_callback: (input) => {
                    if (input)
                        input.destroy();
                    this.emit("end");
                }
            },
            decode: (input) => {
                const timeout = setTimeout(() => {
                    this.emit("error", new Error("Timeout: the stream has been exceeded!"));
                    this.emit("close");
                }, 15e3);
                input.once("readable", () => {
                    clearTimeout(timeout);
                    this._readable = true;
                    this.emit("readable");
                });
            }
        });
        this.input({
            input: new process_1.Process([
                "-ss", `${options.seek ?? 0}`,
                "-i", path,
                "-af", options.filters,
                "-acodec", "libopus",
                "-frame_duration", "20",
                "-f", "opus",
                "pipe:"
            ]),
            events: {
                path: "stdout",
                destroy: ["end", "close", "error"],
                destroy_callback: (input) => {
                    if (input)
                        input.destroy();
                    this.emit("end");
                },
            },
            decode: (input) => {
                input.stdout.pipe(this.encoder);
            },
        });
    }
    ;
    destroy = () => {
        this.played = null;
        this.encoder = null;
        this._destroy();
    };
}
exports.PipeAudioResource = PipeAudioResource;
