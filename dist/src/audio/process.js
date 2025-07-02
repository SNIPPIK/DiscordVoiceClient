"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Process = void 0;
const node_child_process_1 = require("node:child_process");
class Process {
    _process;
    get process() {
        return this._process;
    }
    ;
    get stdout() {
        return this?._process?.stdout ?? null;
    }
    ;
    constructor(args, name = ffmpeg_path) {
        if (!name)
            throw Error("[Critical] FFmpeg not found!");
        const index_resource = args.indexOf("-i");
        const index_seek = args.indexOf("-ss");
        if (index_resource !== -1) {
            const isLink = args.at(index_resource + 1)?.startsWith("http");
            if (isLink)
                args.unshift("-reconnect", "1", "-reconnect_at_eof", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5");
        }
        if (index_seek !== -1) {
            const seek = parseInt(args.at(index_seek + 1));
            if (isNaN(seek) || seek === 0)
                args.splice(index_seek, 2);
        }
        args.unshift("-vn", "-loglevel", "panic");
        this._process = (0, node_child_process_1.spawn)(name, args);
        for (let event of ["end", "error", "exit"]) {
            this.process.once(event, this.destroy);
        }
    }
    ;
    destroy = () => {
        if (this._process) {
            for (const std of [this._process.stdout, this._process.stderr, this._process.stdin]) {
                std.removeAllListeners();
                std.destroy();
            }
            this._process.ref();
            this._process.removeAllListeners();
            this._process.kill("SIGKILL");
            this._process = null;
        }
    };
}
exports.Process = Process;
let ffmpeg_path = null;
(async () => {
    for (const name of ["ffmpeg"]) {
        try {
            const result = (0, node_child_process_1.spawnSync)(name, ['-h'], { windowsHide: true });
            if (result.error)
                continue;
            ffmpeg_path = name;
            return;
        }
        catch { }
    }
})();
