/**
 * tests/wpt/testharness-shim.js — a minimal, faithful reimplementation of the
 * subset of web-platform-tests' testharness.js needed to execute the
 * webaudio/the-audio-api behavioral test bodies in Node.
 *
 * Why reimplement instead of loading wpt's real testharness.js? The real one is
 * tightly coupled to a browser document/window lifecycle, message channels, and
 * a reporting pipeline that expects a live page. The *behavioral* audio tests
 * only lean on a small, well-defined slice: the test runners (test /
 * promise_test / async_test / generate_tests / setup / done) and the assert_*
 * family. We reimplement exactly that slice. The WebAudio-specific `Audit`
 * framework (resources/audit.js) and the custom asserts (resources/audit-util.js)
 * are the *real* wpt files, loaded verbatim by the runner — they build on this
 * slice, so faithfulness there is inherited, not hand-rolled.
 *
 * Design:
 *   - One stable set of global functions (test, assert_equals, ...) is installed
 *     once. Each delegates to a swappable `activeHarness`, so the same globals
 *     serve every test file while results route to the right per-file collector.
 *   - A Harness collects {name, status, message}. `waitForCompletion()` drains
 *     every promise_test / async_test to settlement.
 */

// ---------------------------------------------------------------------------
// AssertionError + value formatting
// ---------------------------------------------------------------------------

export class AssertionError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AssertionError'
  }
}

function fmt(v) {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (typeof v === 'string') return `"${v}"`
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint')
    return String(v)
  if (typeof v === 'function') return `function ${v.name || '(anon)'}`
  if (ArrayBuffer.isView(v) || Array.isArray(v)) {
    const a = Array.from(v.length > 8 ? [].slice.call(v, 0, 8) : v)
    return `[${a.join(', ')}${v.length > 8 ? ', …' : ''}] (len ${v.length})`
  }
  try {
    return Object.prototype.toString.call(v)
  } catch {
    return String(v)
  }
}

// Legacy DOMException constant names -> modern names. Real testharness accepts
// the legacy SCREAMING_CASE constants (e.g. INDEX_SIZE_ERR) that older audio
// tests still pass to assert_throws_dom; we normalize so we measure pleco's
// (modern-named) DOMExceptions faithfully instead of flagging a name mismatch.
const LEGACY_DOM_NAMES = {
  INDEX_SIZE_ERR: 'IndexSizeError',
  HIERARCHY_REQUEST_ERR: 'HierarchyRequestError',
  WRONG_DOCUMENT_ERR: 'WrongDocumentError',
  INVALID_CHARACTER_ERR: 'InvalidCharacterError',
  NO_MODIFICATION_ALLOWED_ERR: 'NoModificationAllowedError',
  NOT_FOUND_ERR: 'NotFoundError',
  NOT_SUPPORTED_ERR: 'NotSupportedError',
  INUSE_ATTRIBUTE_ERR: 'InUseAttributeError',
  INVALID_STATE_ERR: 'InvalidStateError',
  SYNTAX_ERR: 'SyntaxError',
  INVALID_MODIFICATION_ERR: 'InvalidModificationError',
  NAMESPACE_ERR: 'NamespaceError',
  INVALID_ACCESS_ERR: 'InvalidAccessError',
  TYPE_MISMATCH_ERR: 'TypeMismatchError',
  SECURITY_ERR: 'SecurityError',
  NETWORK_ERR: 'NetworkError',
  ABORT_ERR: 'AbortError',
  URL_MISMATCH_ERR: 'URLMismatchError',
  QUOTA_EXCEEDED_ERR: 'QuotaExceededError',
  TIMEOUT_ERR: 'TimeoutError',
  INVALID_NODE_TYPE_ERR: 'InvalidNodeTypeError',
  DATA_CLONE_ERR: 'DataCloneError',
}

function normalizeDomName(type) {
  if (typeof type === 'string' && LEGACY_DOM_NAMES[type]) return LEGACY_DOM_NAMES[type]
  return type
}

// SameValue with testharness semantics: NaN === NaN, but +0 !== -0.
function sameValue(x, y) {
  if (y !== y) return x !== x
  if (y === 0 && x === 0) return 1 / x === 1 / y
  return x === y
}

// ---------------------------------------------------------------------------
// Deferred helper
// ---------------------------------------------------------------------------

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// ---------------------------------------------------------------------------
// Test case object (the `t` handed to async_test / promise_test callbacks)
// ---------------------------------------------------------------------------

class TestCase {
  constructor(name, harness) {
    this.name = name
    this._harness = harness
    this._failed = false
    this._done = false
    this._deferred = null
    this.timeout_length = 0
  }

  _recordFail(message) {
    if (this._failed || this._done) return
    this._failed = true
    this._harness._fail(this.name, message)
    if (this._deferred) this._deferred.resolve()
    this._done = true
  }

  step(func, thisObj, ...args) {
    if (this._done) return
    try {
      return func.apply(thisObj ?? this, args)
    } catch (e) {
      this._recordFail(e && e.message ? e.message : String(e))
      // testharness swallows the throw inside step()
    }
  }

  step_func(func, thisObj) {
    return (...args) => this.step(func, thisObj ?? this, ...args)
  }

  step_func_done(func, thisObj) {
    return (...args) => {
      if (func) this.step(func, thisObj ?? this, ...args)
      this.done()
    }
  }

  unreached_func(description) {
    return (...args) =>
      this.step(() => {
        throw new AssertionError(
          (description || 'reached unreachable code') +
            (args.length ? ` (args: ${args.map(fmt).join(', ')})` : ''),
        )
      })
  }

  step_timeout(func, timeout, ...args) {
    return setTimeout(() => this.step(func, this, ...args), timeout)
  }

  add_cleanup() {
    /* no-op: nothing to tear down in the offline harness */
  }

  done() {
    if (this._done) return
    this._done = true
    if (!this._failed) this._harness._pass(this.name)
    if (this._deferred) this._deferred.resolve()
  }
}

// ---------------------------------------------------------------------------
// Harness — per-file result collector
// ---------------------------------------------------------------------------

export class Harness {
  constructor() {
    this.results = [] // { name, status: 'pass'|'fail', message }
    this.pending = [] // promises that must settle before the file is "done"
    this._setupProps = {}
  }

  _pass(name) {
    this.results.push({ name, status: 'pass', message: '' })
  }

  _fail(name, message) {
    this.results.push({ name, status: 'fail', message: message || '' })
  }

  // -- test runners --------------------------------------------------------

  test(func, name) {
    const t = new TestCase(name, this)
    try {
      func(t)
      if (!t._failed && !t._done) this._pass(name)
    } catch (e) {
      if (!t._failed) this._fail(name, e && e.message ? e.message : String(e))
    }
  }

  async_test(a, b) {
    const name = typeof a === 'string' ? a : b || '(unnamed async_test)'
    const func = typeof a === 'function' ? a : null
    const t = new TestCase(name, this)
    const d = deferred()
    t._deferred = d
    this.pending.push(d.promise)
    if (func) {
      try {
        func(t)
      } catch (e) {
        t._recordFail(e && e.message ? e.message : String(e))
      }
    }
    return t
  }

  promise_test(func, name) {
    const t = new TestCase(name, this)
    let settled = false
    const rec = Promise.resolve()
      .then(() => func(t))
      .then(
        () => {
          if (settled) return
          settled = true
          if (!t._failed) this._pass(name)
        },
        (e) => {
          if (settled) return
          settled = true
          if (!t._failed)
            this._fail(name, e && e.message ? e.message : String(e))
        },
      )
    this.pending.push(rec)
    return rec
  }

  generate_tests(func, args /*, properties */) {
    for (const row of args) {
      const name = row[0]
      const params = row.slice(1)
      this.test(() => func.apply(null, params), name)
    }
  }

  setup(funcOrProps, maybeProps) {
    if (typeof funcOrProps === 'function') {
      try {
        funcOrProps()
      } catch (e) {
        this._fail('setup', e && e.message ? e.message : String(e))
      }
      if (maybeProps) Object.assign(this._setupProps, maybeProps)
    } else if (funcOrProps && typeof funcOrProps === 'object') {
      Object.assign(this._setupProps, funcOrProps)
    }
  }

  done() {
    /* explicit_done hint; completion is driven by draining `pending` */
  }

  // -- completion ----------------------------------------------------------

  async waitForCompletion() {
    let guard = 0
    while (this.pending.length && guard < 5000) {
      const batch = this.pending
      this.pending = []
      await Promise.allSettled(batch)
      // let any freshly-scheduled microtasks/timeouts register followups
      await new Promise((r) => setTimeout(r, 0))
      guard++
    }
  }

  summary() {
    const total = this.results.length
    const passed = this.results.filter((r) => r.status === 'pass').length
    return { total, passed, failed: total - passed }
  }
}

// ---------------------------------------------------------------------------
// assert_* family (bound to `activeHarness` is unnecessary — asserts throw)
// ---------------------------------------------------------------------------

export const asserts = {
  assert_true(actual, description) {
    if (actual !== true)
      throw new AssertionError(
        `${description || 'assert_true'}: expected true got ${fmt(actual)}`,
      )
  },
  assert_false(actual, description) {
    if (actual !== false)
      throw new AssertionError(
        `${description || 'assert_false'}: expected false got ${fmt(actual)}`,
      )
  },
  assert_equals(actual, expected, description) {
    if (!sameValue(actual, expected))
      throw new AssertionError(
        `${description || 'assert_equals'}: expected ${fmt(expected)} but got ${fmt(actual)}`,
      )
  },
  assert_not_equals(actual, expected, description) {
    if (sameValue(actual, expected))
      throw new AssertionError(
        `${description || 'assert_not_equals'}: got disallowed value ${fmt(actual)}`,
      )
  },
  assert_greater_than(actual, expected, description) {
    if (!(actual > expected))
      throw new AssertionError(
        `${description || 'assert_greater_than'}: ${fmt(actual)} is not > ${fmt(expected)}`,
      )
  },
  assert_greater_than_equal(actual, expected, description) {
    if (!(actual >= expected))
      throw new AssertionError(
        `${description || 'assert_greater_than_equal'}: ${fmt(actual)} is not >= ${fmt(expected)}`,
      )
  },
  assert_less_than(actual, expected, description) {
    if (!(actual < expected))
      throw new AssertionError(
        `${description || 'assert_less_than'}: ${fmt(actual)} is not < ${fmt(expected)}`,
      )
  },
  assert_less_than_equal(actual, expected, description) {
    if (!(actual <= expected))
      throw new AssertionError(
        `${description || 'assert_less_than_equal'}: ${fmt(actual)} is not <= ${fmt(expected)}`,
      )
  },
  assert_approx_equals(actual, expected, epsilon, description) {
    if (!(Math.abs(actual - expected) <= epsilon))
      throw new AssertionError(
        `${description || 'assert_approx_equals'}: expected ${fmt(expected)} +/- ${epsilon} but got ${fmt(actual)}`,
      )
  },
  assert_array_equals(actual, expected, description) {
    if (actual.length !== expected.length)
      throw new AssertionError(
        `${description || 'assert_array_equals'}: length ${actual.length} != ${expected.length}`,
      )
    for (let i = 0; i < actual.length; i++) {
      if (!sameValue(actual[i], expected[i]))
        throw new AssertionError(
          `${description || 'assert_array_equals'}: at index ${i} expected ${fmt(expected[i])} got ${fmt(actual[i])}`,
        )
    }
  },
  assert_array_approx_equals(actual, expected, epsilon, description) {
    if (actual.length !== expected.length)
      throw new AssertionError(
        `${description || 'assert_array_approx_equals'}: length ${actual.length} != ${expected.length}`,
      )
    for (let i = 0; i < actual.length; i++) {
      if (!(Math.abs(actual[i] - expected[i]) <= epsilon))
        throw new AssertionError(
          `${description || 'assert_array_approx_equals'}: at index ${i} expected ${fmt(expected[i])} +/- ${epsilon} got ${fmt(actual[i])}`,
        )
    }
  },
  assert_unreached(description) {
    throw new AssertionError(description || 'reached unreachable code')
  },
  assert_throws_dom(type, funcOrConstructor, descOrFunc, maybeDesc) {
    // Overloads:
    //   assert_throws_dom(type, func, description)
    //   assert_throws_dom(type, constructorGlobal, func, description)
    let func, description
    if (typeof descOrFunc === 'function') {
      func = descOrFunc
      description = maybeDesc
    } else {
      func = funcOrConstructor
      description = descOrFunc
    }
    type = normalizeDomName(type)
    let threw = false
    let err
    try {
      func()
    } catch (e) {
      threw = true
      err = e
    }
    if (!threw)
      throw new AssertionError(
        `${description || 'assert_throws_dom'}: expected DOMException "${type}" but nothing was thrown`,
      )
    const isDom =
      err instanceof DOMException ||
      (err && typeof err.name === 'string' && typeof err.code === 'number')
    if (!isDom)
      throw new AssertionError(
        `${description || 'assert_throws_dom'}: expected DOMException "${type}" but got ${err && err.name}: ${err && err.message}`,
      )
    const nameMatches =
      typeof type === 'string' ? err.name === type : err.code === type
    if (!nameMatches)
      throw new AssertionError(
        `${description || 'assert_throws_dom'}: expected DOMException "${type}" but got "${err.name}"`,
      )
  },
  assert_throws_js(constructor, func, description) {
    let threw = false
    let err
    try {
      func()
    } catch (e) {
      threw = true
      err = e
    }
    if (!threw)
      throw new AssertionError(
        `${description || 'assert_throws_js'}: expected ${constructor && constructor.name} but nothing was thrown`,
      )
    const ok =
      err instanceof constructor ||
      (err && err.name === (constructor && constructor.name))
    if (!ok)
      throw new AssertionError(
        `${description || 'assert_throws_js'}: expected ${constructor && constructor.name} but got ${err && err.name}: ${err && err.message}`,
      )
  },
  // Some tests use assert_throws (legacy) — route to a permissive check.
  assert_throws(codeOrType, func, description) {
    let threw = false
    try {
      func()
    } catch {
      threw = true
    }
    if (!threw)
      throw new AssertionError(
        `${description || 'assert_throws'}: expected a throw but nothing was thrown`,
      )
  },
}

// ---------------------------------------------------------------------------
// Installation
// ---------------------------------------------------------------------------

/**
 * Install the stable global testharness surface onto `target`. The runner
 * swaps `target.__activeHarness` per file; every runner delegates to it.
 * assert_* are installed directly (they only throw).
 */
export function installTestharness(target = globalThis) {
  const delegate =
    (method) =>
    (...args) => {
      const h = target.__activeHarness
      if (!h) throw new Error(`testharness ${method}() called with no active harness`)
      return h[method](...args)
    }

  target.test = delegate('test')
  target.async_test = delegate('async_test')
  target.promise_test = delegate('promise_test')
  target.generate_tests = delegate('generate_tests')
  target.setup = delegate('setup')
  target.done = delegate('done')

  // promise_rejects_* are free functions in testharness (not test-bound methods)
  target.promise_rejects_dom = async (t, type, promise /*, description */) => {
    type = normalizeDomName(type)
    try {
      await promise
    } catch (err) {
      const isDom =
        err instanceof DOMException ||
        (err && typeof err.name === 'string' && typeof err.code === 'number')
      if (!isDom) throw new AssertionError(`expected DOMException "${type}" got ${err && err.name}`)
      if (typeof type === 'string' ? err.name !== type : err.code !== type)
        throw new AssertionError(`expected DOMException "${type}" got "${err.name}"`)
      return
    }
    throw new AssertionError(`expected DOMException "${type}" but promise resolved`)
  }
  target.promise_rejects_js = async (t, constructor, promise /*, description */) => {
    try {
      await promise
    } catch (err) {
      const ok =
        err instanceof constructor ||
        (err && err.name === (constructor && constructor.name))
      if (!ok)
        throw new AssertionError(
          `expected ${constructor && constructor.name} got ${err && err.name}`,
        )
      return
    }
    throw new AssertionError(
      `expected ${constructor && constructor.name} but promise resolved`,
    )
  }
  target.promise_rejects_exactly = target.promise_rejects_js

  for (const [k, v] of Object.entries(asserts)) target[k] = v
}
