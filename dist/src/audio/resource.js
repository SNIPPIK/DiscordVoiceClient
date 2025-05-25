"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioResource = void 0;
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
        if (this.position >= this.size)
            return null;
        const frame = this._chunks[this._position++];
        return frame ?? null;
    }
    ;
    clear = () => {
        this._chunks.length = 0;
    };
}
class AudioResource extends emitter_1.TypedEmitter {
    config;
    _buffer = new AudioBuffer();
    _seek = 0;
    get readable() {
        return this._buffer.position !== this._buffer.size;
    }
    ;
    get duration() {
        if (!this._buffer.position)
            return 0;
        return Math.abs(((this._seek - this._buffer.position) * 20) / 1e3);
    }
    ;
    get packet() {
        return this._buffer.packet;
    }
    ;
    set input(options) {
        for (const event of options.events.destroy) {
            const path = options.events.path ? options.input[options.events.path] : options.input;
            path["once"](event, (err) => {
                if (event === "error")
                    this.emit("error", new Error(`AudioResource get ${err}`));
                options.events.destroy_callback(options.input);
            });
        }
        this.once("close", () => {
            options.events.destroy_callback(options.input);
        });
        if (options.input instanceof process_1.Process)
            options.input.stdout.pipe(options.decoder);
        else {
            const timeout = setTimeout(() => {
                this.emit("error", new Error("Timeout: the stream has been exceeded!"));
                this.emit("close");
            }, 15e3);
            options.input.on("frame", (packet) => {
                if (this._buffer.size === 0) {
                    clearTimeout(timeout);
                    this.emit("readable");
                    if (!this._seek)
                        this._buffer.packet = opus_1.SILENT_FRAME;
                }
                this._buffer.packet = packet;
            });
        }
    }
    ;
    constructor(config) {
        super();
        this.config = config;
        const { path, options } = config;
        if (options?.seek > 0)
            this._seek = (options.seek * 1e3) / 20;
        const decoder = new opus_1.OpusEncoder();
        this.input = {
            events: {
                destroy: ["end", "close", "error"],
                destroy_callback: (input) => {
                    if (input) {
                        input.destroy();
                        this._buffer.packet = opus_1.SILENT_FRAME;
                    }
                    this.emit("end");
                }
            },
            input: decoder
        };
        this.input = {
            decoder,
            events: {
                path: "stdout",
                destroy: ["end", "close", "error"],
                destroy_callback: (input) => {
                    if (input)
                        input.destroy();
                    this.emit("end");
                },
            },
            input: new process_1.Process([
                "-ss", `${options.seek ?? 0}`,
                "-i", path,
                "-af", options.filters,
                "-c:a", "libopus",
                "-f", "opus",
                "-application", "audio",
                "-ar", "48000",
                "-ac", "2",
                "pipe:"
            ])
        };
    }
    ;
    refresh = () => {
        this._seek = 0;
        this._buffer.position = 0;
    };
    destroy = () => {
        this.emit("close");
        this._buffer.clear();
        this.removeAllListeners();
    };
}
exports.AudioResource = AudioResource;
