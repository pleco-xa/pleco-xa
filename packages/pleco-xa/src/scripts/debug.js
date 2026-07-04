// debug.js 
export let DEBUG_ENABLED = Boolean(
  (typeof process !== 'undefined' && process.env && process.env.PLECO_DEBUG) ||
    (typeof window !== 'undefined' && window.PLECO_DEBUG)
)

export function setDebug(enabled) {
  DEBUG_ENABLED = Boolean(enabled)
  if (typeof window !== 'undefined') {
    window.PLECO_DEBUG = DEBUG_ENABLED
  }
  if (typeof process !== 'undefined' && process.env) {
    process.env.PLECO_DEBUG = DEBUG_ENABLED ? 'true' : ''
  }
}

export function debugLog(...args) {
  if (DEBUG_ENABLED) {
    console.log(...args)
  }
}

export function debugWarn(...args) {
  if (DEBUG_ENABLED) {
    console.warn(...args)
  }
}

export function debugError(...args) {
  if (DEBUG_ENABLED) {
    console.error(...args)
  }
}

export function debugTime(label) {
  if (DEBUG_ENABLED) {
    console.time(label)
  }
}

export function debugTimeEnd(label) {
  if (DEBUG_ENABLED) {
    console.timeEnd(label)
  }
}

export function isDebugEnabled() {
  return DEBUG_ENABLED
}
