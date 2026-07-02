/**
 * scripts/xa-cache.js — call-count LRU proof.
 * Counts real underlying-function invocations to prove hits, LRU eviction order,
 * the wrapper() decorator, and memoize()'s WeakMap identity semantics.
 * NOTE: LRUCache.eval(fn, ...args) is the librosa cache API port (method name
 * from librosa.cache) — it invokes the passed fn, never JS global eval.
 * (xa-cache is not on the dist curated surface yet — imported from src; the
 * module is pure ESM with zero dependencies, import-safe everywhere.)
 */
import { LRUCache, wrapper, memoize } from '../../packages/pleco-xa/src/scripts/xa-cache.js'
import { check, summary } from './_harness.mjs'

let calls = 0
const slow = function slow(x) {
  calls++
  return x * 2
}

const cache = new LRUCache(2)
check('cache.eval(slow, 5) returns 10', cache.eval(slow, 5), 10)
cache.eval(slow, 5)
check('repeat cache.eval(slow, 5) -> 1 underlying call (cache hit)', calls, 1)

cache.eval(slow, 6)
cache.eval(slow, 7) // maxSize 2: inserting 7 evicts key 5 (least recently used)
cache.eval(slow, 5) // therefore this must recompute
check('eval 6, 7, then 5 again -> 4 calls (LRU evicted key 5)', calls, 4)
console.log(cache.format())
check('format() shows the two surviving keys',
  cache.format(), "LRUCache(size=2/2, keys=['slow:[7]', 'slow:[5]'])")

let wCalls = 0
const cached = wrapper(function wfn(x) {
  wCalls++
  return x + 1
}, 10)
cached(10)
cached(10)
check('wrapper: two same-arg calls -> 1 underlying call', wCalls, 1)
check('wrapper.cache.size() == 1', cached.cache.size(), 1)

let mCalls = 0
const mem = memoize((o) => {
  mCalls++
  return o.a
})
const obj = { a: 1 }
mem(obj)
mem(obj)
check('memoize: same object twice -> 1 call (WeakMap hit)', mCalls, 1)
mem({ a: 1 }) // structurally equal but new identity -> WeakMap miss by design
check('memoize: distinct-identity equal object -> recompute (WeakMap identity)', mCalls, 2)

summary('xa-cache — call-count LRU proof')
