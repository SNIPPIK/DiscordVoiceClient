"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientUDPSocket = void 0;
const node_dgram_1 = require("node:dgram");
const emitter_1 = require("../emitter");
const node_net_1 = require("node:net");
const MAX_SIZE_VALUE = 2 ** 32 - 1;
class ClientUDPSocket extends emitter_1.TypedEmitter {
    isConnected = false;
    destroyed = false;
    socket;
    keepAlive = {
        interval: null,
        intervalMs: 0,
        timeout: null,
        buffer: Buffer.alloc(4),
        counter: 0
    };
    options;
    set packet(packet) {
        this.socket.send(packet, 0, packet.length, this.options.port, this.options.ip, (err) => {
            if (err)
                this.emit("error", err);
        });
        this.resetKeepAliveInterval();
    }
    ;
    get connected() {
        return this.isConnected;
    }
    ;
    connect = (options) => {
        this.keepAlive.intervalMs = options.heartbeat_interval;
        if (this.options !== undefined) {
            if (options.ip === this.options.ip && options.port === this.options.port && options.ssrc === this.options.ssrc)
                return;
            this.removeAllListeners();
        }
        this.options = options;
        if (this.socket)
            this.reset();
        if ((0, node_net_1.isIPv4)(options.ip))
            this.socket = (0, node_dgram_1.createSocket)("udp4");
        else
            this.socket = (0, node_dgram_1.createSocket)("udp6");
        this.discovery(options.ssrc);
        this.socket.on("error", (err) => {
            this.emit("error", err);
        });
        this.socket.on("listening", () => {
            try {
                this.socket.setRecvBufferSize(1024 * 1024);
                this.socket.setSendBufferSize(1024 * 1024);
            }
            catch (e) {
                this.emit("error", new Error("Failed to set socket buffer size: " + e));
            }
        });
        this.socket.on("message", (msg) => {
            this.emit("message", msg);
        });
        this.socket.on("close", () => {
            this.isConnected = false;
            this.emit("close");
        });
        this.manageKeepAlive();
    };
    discovery = (ssrc) => {
        this.packet = this.discoveryBuffer(ssrc);
        this.socket.once("message", (message) => {
            if (message.readUInt16BE(0) === 2) {
                const packet = Buffer.from(message);
                const ip = packet.subarray(8, packet.indexOf(0, 8)).toString("utf8");
                const port = packet.readUInt16BE(packet.length - 2);
                if (!(0, node_net_1.isIPv4)(ip)) {
                    this.emit("error", Error("Not found IPv4 address"));
                    return;
                }
                this.isConnected = true;
                this.emit("connected", { ip, port });
            }
        });
    };
    reset = () => {
        if (this.socket) {
            try {
                this.socket.disconnect?.();
                this.socket.close?.();
            }
            catch (err) {
                if (err instanceof Error && err.message.includes("Not running"))
                    return;
            }
        }
        this.socket = null;
    };
    destroy = () => {
        if (this.destroyed)
            return;
        this.destroyed = true;
        clearInterval(this.keepAlive.interval);
        clearTimeout(this.keepAlive.timeout);
        this.socket.removeAllListeners();
        this.removeAllListeners();
        this.keepAlive = null;
        this.destroyed = null;
        this.reset();
    };
    discoveryBuffer = (ssrc) => {
        const packet = Buffer.allocUnsafe(74);
        packet.writeUInt16BE(1, 0);
        packet.writeUInt16BE(70, 2);
        packet.writeUInt32BE(ssrc, 4);
        return packet;
    };
    manageKeepAlive = () => {
        if (this.keepAlive.interval)
            clearInterval(this.keepAlive.interval);
        if (this.keepAlive.timeout)
            clearTimeout(this.keepAlive.timeout);
        this.keepAlive.interval = setInterval(() => {
            if (this.keepAlive.counter > MAX_SIZE_VALUE)
                this.keepAlive.counter = 0;
            this.keepAlive.buffer.writeUInt32BE(this.keepAlive.counter++, 0);
            this.packet = this.keepAlive.buffer;
        }, this.keepAlive.intervalMs);
    };
    resetKeepAliveInterval = () => {
        if (this.keepAlive.interval)
            clearInterval(this.keepAlive.interval);
        if (this.keepAlive.timeout)
            clearTimeout(this.keepAlive.timeout);
        this.keepAlive.timeout = setTimeout(() => this.manageKeepAlive(), 2e3);
    };
}
exports.ClientUDPSocket = ClientUDPSocket;
