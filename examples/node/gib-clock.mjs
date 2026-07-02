/**
 * Proof: core/GibClock.js — drift-corrected clock.
 *
 * Run a 20 ms GibClock for 100 ticks recording performance.now() per tick,
 * then a naive chained setTimeout(20) control for contrast. Assert GibClock
 * mean interval 20±1 ms and |cumulative drift| at tick 100 < 20 ms (one tick)
 * — the naive chain's drift is printed for contrast (it accumulates timer
 * overshoot; GibClock re-anchors each tick to an absolute schedule). Also
 * assert offTick actually removes a listener and stop() halts ticking.
 */
import { GibClock } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const INTERVAL = 20
const TICKS = 100
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function sparkline(values) {
  const blocks = '▁▂▃▄▅▆▇█'
  const max = Math.max(...values.map(Math.abs), 1e-9)
  return values.map((v) => blocks[Math.min(7, Math.floor((Math.abs(v) / max) * 8))]).join('')
}

// ------------------------------------------------------------ GibClock run
const clock = new GibClock(INTERVAL)
let removedCount = 0
const removable = () => removedCount++
clock.onTick(removable)

const times = []
const t0 = performance.now()
await new Promise((resolve) => {
  clock.start(() => {
    if (times.length < TICKS) times.push(performance.now())
    if (times.length === TICKS) resolve()
  })
})

// offTick: freeze the removable listener's count, let ~10 more ticks pass
const countAtRemoval = removedCount
clock.offTick(removable)
await sleep(10 * INTERVAL)
const countAfterRemoval = removedCount

// stop(): no further ticks after stop
clock.stop()
// main listener guards on times.length, so track raw tick flow via a probe
let postStopTicks = 0
clock.onTick(() => postStopTicks++)
await sleep(10 * INTERVAL)

// ------------------------------------------------------- naive control run
const naive = await new Promise((resolve) => {
  const nTimes = []
  const nt0 = performance.now()
  const tick = () => {
    nTimes.push(performance.now())
    if (nTimes.length >= TICKS) return resolve({ t0: nt0, times: nTimes })
    setTimeout(tick, INTERVAL)
  }
  setTimeout(tick, INTERVAL)
})

// ----------------------------------------------------------------- results
const intervals = times.slice(1).map((t, i) => t - times[i])
const mean = (times[TICKS - 1] - times[0]) / (TICKS - 1)
const drift = times[TICKS - 1] - (t0 + TICKS * INTERVAL)
const naiveDrift = naive.times[TICKS - 1] - (naive.t0 + TICKS * INTERVAL)

console.log(`per-tick interval error (|err|, max ${Math.max(...intervals.map((v) => Math.abs(v - INTERVAL))).toFixed(2)} ms):`)
console.log(sparkline(intervals.map((v) => v - INTERVAL)))
console.log(`GibClock cumulative drift @ tick ${TICKS}: ${drift.toFixed(2)} ms`)
console.log(`naive chained setTimeout drift @ tick ${TICKS}: ${naiveDrift.toFixed(2)} ms (for contrast, not asserted)`)

check('GibClock mean tick interval ≈ 20 ms (±1)', mean, INTERVAL, 1)
checkTrue(`|cumulative drift| @ tick ${TICKS} < 20 ms (one tick)`, Math.abs(drift) < INTERVAL, `${drift.toFixed(2)} ms`)
checkTrue('offTick removes the listener (count frozen)', countAfterRemoval === countAtRemoval, `${countAtRemoval} → ${countAfterRemoval}`)
checkTrue('stop() halts ticking (no ticks in 200 ms)', postStopTicks === 0, `${postStopTicks} post-stop ticks`)

summary('core/GibClock.js — drift-corrected clock proof')
