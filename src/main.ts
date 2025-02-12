import { WebSocket } from "ws"
import { WebSocketServer } from 'ws';

import { removeAnsiCodes } from "./util";
type EventListener = (...args: any[]) => void;
type PacketType = Array<any> | Record<string, any>
interface BotOptions {
  auth: string,
  events: Record<string, Function>,
  debug?: boolean
}
interface BotState {
  x: number | undefined,
  y: number | undefined,
  region: string | undefined,
  map: string | undefined
}
const PR_WS = "wss://play.proceduralrealms.com/ws"
class Bot {
  private eventListeners: Record<string, EventListener[]> = {};
  ws: WebSocket
  wss?: WebSocketServer
  startTime: number
  options: BotOptions
  ready: boolean
  botstate: BotState
  constructor(options: BotOptions) {
    this.botstate = { x: undefined, y: undefined, region: undefined, map: undefined };
    this.options = options
    this.ready = false
    this.startTime = 0;
    this.ws = new WebSocket(PR_WS)
    this.ws.on("open", () => {
      this.ws.send(options.auth);
      this.startTime = Date.now();
    });
    this.ws.on("message", (data: string) => {
      this.parsePacket(JSON.parse(data));

    });
    if (this.options.debug === true) {
      console.info("Running in debug mode")
      this.wss = new WebSocketServer({ port: 8008, host: "127.0.0.1" });
      this.wss.on('connection', (client) => {
        console.log('client connected')
        client.on('message', (_data: any) => {
          const data = _data.toString()
          const reqId = JSON.parse(data).reqId
          if (JSON.parse(data).cmd === "token") {
            return setTimeout(() => { client.send(`{"cmd":"token.success","msg":{"name":"Prljav","token":"sadsads"},"reqId":"${reqId}"}`) }, 500)
          }
          this.ws.send(data, { binary: false })
        });

      });
    }

  }
  addEventListener(event: string, listener: EventListener) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(listener);
  }
  removeEventListener(event: string, listener: EventListener) {
    if (!this.eventListeners[event]) return;
    this.eventListeners[event] = this.eventListeners[event].filter(
      (l) => l !== listener
    );
  }
  dispatchEvent(event: string, ...args: any[]) {
    if (!this.eventListeners[event]) return;
    for (const listener of this.eventListeners[event]) {
      listener(...args);
    }
  }
  quit() {
    this.ws.close()
  }
  runCmd(cmd: string) {
    this.ws.send(JSON.stringify({ cmd: "cmd", msg: cmd }));
  }
  sendToClient(msg: string) {
    if (this.options.debug !== true) throw "Not in debug mode, cannot use sendToClient"
    this.wss?.clients.forEach((client) => {
      client.send(msg)
    })
  }
  parsePacket(packet: PacketType) {
    //parsing for the mitm ws server
    if (this.options.debug === true) {
      this.wss?.clients.forEach((client) => {
        client.send(JSON.stringify(packet))
      })
    }
    //end

    if ('cmd' in packet && packet.cmd === "room.describe") {
      try {
        this.botstate.map = packet.msg.map.join('\n')

        const desc = packet.msg.desc;
        const cleanedDesc = removeAnsiCodes(desc);
        this.botstate.region = cleanedDesc.split(' | ')[1].trim()
        const numbers = cleanedDesc.match(/(?<=[ ,])\d+(?=[ ,])/g)
        this.botstate.x = Number(numbers[0])
        this.botstate.y = Number(numbers[1])
        this.dispatchEvent("update", this.botstate)
      } catch (e) {
        console.warn(`Failed to update bot state, ${e}`)
      }
    }
    if ('cmd' in packet && packet.cmd === "token.success") {
      this.ready = true
      this.dispatchEvent("ready", packet)
    }

    if ('cmd' in packet && this.options.events["all"]) {
      this.options.events["all"](packet)
    }
    if ('cmd' in packet && this.options.events[packet.cmd]) {
      this.options.events[packet.cmd](packet)
    }
  }
}
export { Bot, BotOptions, PacketType, BotState, removeAnsiCodes }