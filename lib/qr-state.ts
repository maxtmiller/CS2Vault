import { EventEmitter } from "events"

// Singleton module — shared across all route handlers in the same process
const globalAny = global as any

if (!globalAny.__qrAuthEmitter) {
  globalAny.__qrAuthEmitter = new EventEmitter()
  globalAny.__qrAuthEmitter.setMaxListeners(20)
}

if (!globalAny.__qrSession) {
  globalAny.__qrSession = null
}

export const authEmitter: EventEmitter = globalAny.__qrAuthEmitter

export function setQRSession(s: any) {
  globalAny.__qrSession = s
}

export function getQRSession(): any {
  return globalAny.__qrSession
}
