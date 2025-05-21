"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientUDPSocket = void 0;
const node_dgram_1 = require("node:dgram");
const emitter_1 = require("../emitter");
const node_net_1 = require("node:net");
const ALIVE_INTERVAL = 5e3;
const MAX_SIZE_VALUE = 2 ** 32 - 1;
class ClientUDPSocket extends emitter_1.TypedEmitter {
    options;
    destroyed = false;
    socket = (0, node_dgram_1.createSocket)({ type: "udp4" });
    keepAliveInterval;
    keepAliveBuffer = Buffer.alloc(4);
    keepAliveCounter = 0;
    set packet(packet) {
        this.socket.send(packet, 0, packet.length, this.options.port, this.options.ip, (err) => {
            if (err)
                this.emit("error", err);
        });
    }
    ;
    constructor(options) {
        super();
        this.options = options;
        this.socket.on("error", async (err) => {
            this.emit("error", err);
        });
        this.socket.on("close", async () => {
            this.emit("close");
        });
        this.keepAliveInterval = setInterval(this.keepAlive, ALIVE_INTERVAL);
    }
    ;
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
                this.emit("connected", { ip, port });
            }
        });
    };
    discoveryBuffer = (ssrc) => {
        const packet = Buffer.alloc(74);
        packet.writeUInt16BE(1, 0);
        packet.writeUInt16BE(70, 2);
        packet.writeUInt32BE(ssrc, 4);
        return packet;
    };
    keepAlive = () => {
        this.packet = this.keepAliveBuffer;
        this.keepAliveCounter++;
        if (this.keepAliveCounter > MAX_SIZE_VALUE) {
            this.keepAliveCounter = 0;
        }
    };
    destroy = () => {
        if (this.destroyed)
            return;
        this.destroyed = true;
        clearInterval(this.keepAliveInterval);
        try {
            this.socket.close();
        }
        catch (err) {
            if (err instanceof Error && err.message.includes("Not running"))
                return;
        }
        this.socket.removeAllListeners();
        this.removeAllListeners();
    };
}
exports.ClientUDPSocket = ClientUDPSocket;
