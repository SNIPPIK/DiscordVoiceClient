"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioResource = void 0;
const opus_1 = require("./opus");
const emitter_1 = require("../emitter");
const process_1 = require("./process");
class AudioResource extends emitter_1.TypedEmitter {
    _audioBuffer = new Array();
    _bufferTotal = 0;
    get readable() {
        return this._audioBuffer.length > 0;
    }
    ;
    get duration() {
        if (!this._audioBuffer.length)
            return 0;
        return ((this._bufferTotal - this._audioBuffer.length) * 20) / 1e3;
    }
    ;
    get packet() {
        return this._audioBuffer.shift();
    }
    ;
    set input(options) {
        for (const event of options.events.destroy) {
            const path = options.events.path ? options.input[options.events.path] : options.input;
            path["once"](event, () => {
                if (event === "error")
                    this.emit("error", new Error("AudioResource get error for create stream"));
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
                if (this._audioBuffer.length === 0) {
                    clearTimeout(timeout);
                    this.emit("readable");
                    if (!this._bufferTotal)
                        this._audioBuffer.push(opus_1.SILENT_FRAME);
                }
                this._audioBuffer.push(packet);
                this._bufferTotal++;
            });
        }
    }
    ;
    constructor(path, options) {
        super();
        if (options.seek > 0)
            this._bufferTotal = (options.seek * 1e3) / 20;
        const decoder = new opus_1.OpusEncoder();
        this.input = {
            events: {
                destroy: ["end", "close", "error"],
                destroy_callback: (input) => {
                    if (input)
                        input.destroy();
                    this._audioBuffer.push(opus_1.SILENT_FRAME);
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
                "-c:a", "libopus", "-f", "opus",
                "-ar", "48000",
                "-ac", "2",
                "pipe:"
            ])
        };
    }
    ;
    destroy = () => {
        this.emit("close");
        this.removeAllListeners();
    };
}
exports.AudioResource = AudioResource;
