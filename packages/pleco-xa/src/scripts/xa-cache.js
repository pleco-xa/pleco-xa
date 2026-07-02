/**
 * Port of librosa.cache utilities
 * Browser-compatible caching system using Map and WeakMap
 * Librosa-compatible cache and decorator utilities for JavaScript
 */

/**
 * LRU (Least Recently Used) Cache implementation for JavaScript
 *
 * Provides a memory-efficient caching system for expensive function calls.
 * Compatible with browser environments using Map for storage.
 */
export class LRUCache {
  /**
   * Create an LRU cache
   * @param {number} maxSize - Maximum number of items to cache (default: 100)
   */
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.accessOrder = [];
  }

  /**
   * Get a value from the cache
   * @param {string} key - Cache key
   * @returns {any} Cached value or undefined if not found
   */
  get(key) {
    if (this.cache.has(key)) {
      // Update access order (move to end)
      this._updateAccessOrder(key);
      return this.cache.get(key);
    }
    return undefined;
  }

  /**
   * Set a value in the cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   */
  set(key, value) {
    if (this.cache.has(key)) {
      // Update existing entry
      this.cache.set(key, value);
      this._updateAccessOrder(key);
    } else {
      // Add new entry
      if (this.cache.size >= this.maxSize) {
        // Evict least recently used
        const lruKey = this.accessOrder.shift();
        this.cache.delete(lruKey);
      }
      this.cache.set(key, value);
      this.accessOrder.push(key);
    }
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Clear the cache
   *
   * Removes all cached entries and resets access order.
   *
   * @example
   * const cache = new LRUCache(100);
   * cache.set('key1', 'value1');
   * cache.clear();
   * console.log(cache.size());  // 0
   */
  clear() {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Get cache size
   * @returns {number} Number of items in cache
   */
  size() {
    return this.cache.size;
  }

  /**
   * Evaluate a function and cache the result
   *
   * Executes a function with given arguments and caches the result.
   * If the same arguments are provided again, returns the cached result.
   *
   * @param {Function} fn - Function to evaluate
   * @param {...any} args - Arguments to pass to function
   * @returns {any} Function result (cached or newly computed)
   *
   * @example
   * const cache = new LRUCache();
   * const expensiveOp = (x) => { console.log('Computing...'); return x * 2; };
   * cache.eval(expensiveOp, 5);  // Logs 'Computing...', returns 10
   * cache.eval(expensiveOp, 5);  // Returns 10 (cached, no log)
   */
  eval(fn, ...args) {
    const key = this._generateKey(fn, args);

    if (this.has(key)) {
      return this.get(key);
    }

    const result = fn(...args);
    this.set(key, result);
    return result;
  }

  /**
   * Return the formatted representation of the cache
   *
   * Provides a human-readable summary of cache contents and statistics.
   *
   * @returns {string} Formatted cache representation
   *
   * @example
   * const cache = new LRUCache(10);
   * cache.set('key1', 'value1');
   * console.log(cache.format());
   * // Output: LRUCache(size=1/10, keys=['key1'])
   */
  format() {
    const keys = Array.from(this.cache.keys());
    const keyList = keys.length > 5
      ? `[${keys.slice(0, 5).map(k => `'${k}'`).join(', ')}, ... +${keys.length - 5} more]`
      : `[${keys.map(k => `'${k}'`).join(', ')}]`;

    return `LRUCache(size=${this.size()}/${this.maxSize}, keys=${keyList})`;
  }

  /**
   * Reduce the size of the cache
   *
   * Evicts least recently used entries until cache is at or below target size.
   *
   * @param {number} targetSize - Desired maximum cache size (default: maxSize / 2)
   *
   * @example
   * const cache = new LRUCache(100);
   * // ... fill cache with 100 items ...
   * cache.reduce_size(50);  // Keep only 50 most recently used items
   */
  reduce_size(targetSize = null) {
    const target = targetSize !== null ? targetSize : Math.floor(this.maxSize / 2);

    while (this.size() > target) {
      const lruKey = this.accessOrder.shift();
      this.cache.delete(lruKey);
    }
  }

  /**
   * Raise a warning about cache usage
   *
   * Logs a warning message to console about cache state or usage.
   *
   * @param {string} message - Warning message
   * @param {Object} options - Warning options
   * @param {string} options.category - Warning category (default: 'CacheWarning')
   * @param {number} options.stacklevel - Stack trace level for logging
   *
   * @example
   * cache.warn('Cache is 90% full', { category: 'PerformanceWarning' });
   */
  warn(message, options = {}) {
    const { category = 'CacheWarning', stacklevel = 1 } = options;

    console.warn(`[${category}] ${message}`);
    console.warn(`Cache status: ${this.format()}`);

    // Optionally show stack trace
    if (stacklevel > 1) {
      console.trace();
    }
  }

  /**
   * Update access order for LRU tracking
   * @private
   */
  _updateAccessOrder(key) {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * Generate cache key from function and arguments
   * @private
   */
  _generateKey(fn, args) {
    const fnName = fn.name || 'anonymous';
    const argsStr = JSON.stringify(args);
    return `${fnName}:${argsStr}`;
  }

  /**
   * Make cache callable - evaluate a function and cache result
   *
   * JavaScript equivalent of Python's __call__ magic method.
   * Allows cache instance to be used as a function.
   *
   * @param {Function} fn - Function to evaluate
   * @param {...any} args - Arguments to pass to function
   * @returns {any} Function result (cached or newly computed)
   *
   * @example
   * const cache = new LRUCache();
   * const result = cache.call(expensiveFunction, arg1, arg2);
   */
  call(fn, ...args) {
    return this.eval(fn, ...args);
  }

  /**
   * String representation of cache (JavaScript equivalent of Python's __repr__)
   *
   * @returns {string} String representation of cache
   *
   * @example
   * const cache = new LRUCache(50);
   * console.log(cache.toString());  // "LRUCache(size=0/50, keys=[])"
   */
  toString() {
    return this.format();
  }
}

/**
 * Create a wrapper decorator that adds LRU caching to a function
 *
 * Returns a new function that caches results based on input arguments.
 * Subsequent calls with the same arguments return cached results.
 *
 * @param {Function} fn - Function to wrap with caching
 * @param {number} maxSize - Maximum cache size (default: 100)
 * @returns {Function} Cached version of the function
 *
 * @example
 * // Cache expensive spectrogram calculations
 * const cachedStft = wrapper(stft, 50);
 * const S1 = cachedStft(audioData, {nFft: 2048});
 * const S2 = cachedStft(audioData, {nFft: 2048});  // Returns cached result
 *
 * @example
 * // Manual cache management
 * const cachedFunc = wrapper(myFunction, 100);
 * cachedFunc.cache.clear();  // Clear cache
 * console.log(cachedFunc.cache.format());  // Inspect cache
 */
export function wrapper(fn, maxSize = 100) {
  const cache = new LRUCache(maxSize);

  const cachedFunction = function(...args) {
    return cache.eval(fn, ...args);
  };

  // Attach cache instance for inspection/management
  cachedFunction.cache = cache;
  cachedFunction.original = fn;

  return cachedFunction;
}

/**
 * Apply a decorator to a function (Python decorator metaprogramming helper)
 *
 * Internal helper for applying decorators in JavaScript.
 * Mimics Python's decorator application mechanism.
 *
 * @param {Function} decorator - Decorator function to apply
 * @param {Function} fn - Function to decorate
 * @param {...any} decoratorArgs - Arguments to pass to decorator
 * @returns {Function} Decorated function
 *
 * @example
 * // Apply caching decorator
 * const cachedFunc = _decorator_apply(wrapper, myFunction, 100);
 *
 * @example
 * // Apply deprecation decorator
 * const deprecatedFunc = _decorator_apply(
 *   deprecated,
 *   oldFunction,
 *   '1.0.0',
 *   '2.0.0',
 *   'Use newFunction instead'
 * );
 */
export function _decorator_apply(decorator, fn, ...decoratorArgs) {
  if (decoratorArgs.length > 0) {
    // Decorator with arguments: decorator(...args)(fn)
    return decorator(...decoratorArgs)(fn);
  } else {
    // Decorator without arguments: decorator(fn)
    return decorator(fn);
  }
}

/**
 * Mark a function as deprecated with console warnings
 *
 * Returns a wrapped function that logs deprecation warnings on first call.
 * Compatible with browser console for deprecation tracking.
 *
 * @param {string} version - Version when function was deprecated
 * @param {string} versionRemoved - Version when function will be removed
 * @param {string} message - Optional custom deprecation message
 * @returns {Function} Decorator function
 *
 * @example
 * // Deprecate a function
 * const oldFunction = deprecated('1.0.0', '2.0.0', 'Use newFunction instead')(
 *   function oldFunction(x) { return x * 2; }
 * );
 *
 * oldFunction(5);  // Logs deprecation warning, returns 10
 *
 * @example
 * // Using as decorator pattern
 * function myDeprecatedFunc(x) { return x + 1; }
 * const wrapped = deprecated('1.5.0', '2.0.0')(myDeprecatedFunc);
 */
export function deprecated(version, versionRemoved, message = null) {
  return function decorator(fn) {
    let warningShown = false;

    return function(...args) {
      if (!warningShown) {
        const fnName = fn.name || 'anonymous function';
        const defaultMsg = `${fnName} is deprecated as of version ${version} and will be removed in version ${versionRemoved}`;
        const warningMsg = message || defaultMsg;

        console.warn(`[DeprecationWarning] ${warningMsg}`);
        console.trace();

        warningShown = true;
      }

      return fn.apply(this, args);
    };
  };
}

/**
 * Mark functions as moved/renamed with console warnings
 *
 * Indicates a function has been relocated to a new module or renamed.
 * Logs informative messages to guide users to the new location.
 *
 * @param {string} movedFrom - Original module/location
 * @param {string} version - Version when function was moved
 * @param {string} versionRemoved - Version when old location will be removed
 * @param {string} newLocation - Optional new location hint
 * @returns {Function} Decorator function
 *
 * @example
 * // Mark function as moved
 * const movedFunc = moved('librosa.core', '1.0.0', '2.0.0', 'librosa.feature')(
 *   function spectral_centroid(S) { return computeCentroid(S); }
 * );
 *
 * movedFunc(spectrogram);  // Logs moved warning, executes function
 *
 * @example
 * // Indicate module reorganization
 * const beatTrack = moved('xa-rhythm', '1.5.0', '2.0.0', 'xa-tempo')(beat_track);
 */
export function moved(movedFrom, version, versionRemoved, newLocation = null) {
  return function decorator(fn) {
    let warningShown = false;

    return function(...args) {
      if (!warningShown) {
        const fnName = fn.name || 'anonymous function';
        const locationInfo = newLocation
          ? ` It has been moved to ${newLocation}.`
          : '';

        const warningMsg = `${fnName} was moved from ${movedFrom} in version ${version}.${locationInfo} The old location will be removed in version ${versionRemoved}.`;

        console.warn(`[MovedWarning] ${warningMsg}`);
        console.trace();

        warningShown = true;
      }

      return fn.apply(this, args);
    };
  };
}

/**
 * Handle renamed keyword arguments with deprecation warnings
 *
 * Provides backward compatibility for renamed function parameters
 * while warning users to migrate to the new parameter name.
 *
 * @param {string} oldName - Original parameter name
 * @param {any} oldValue - Value passed with old parameter name
 * @param {string} newName - New parameter name
 * @param {any} newValue - Value passed with new parameter name
 * @param {string} versionDeprecated - Version when old name was deprecated
 * @param {string} versionRemoved - Version when old name will be removed
 * @returns {any} The appropriate value to use (new value if provided, else old value)
 *
 * @example
 * // Handle renamed parameter in function
 * function processAudio({
 *   n_fft = 2048,
 *   nFft = null,
 *   ...options
 * }) {
 *   const fftSize = rename_kw(
 *     'nFft', nFft,
 *     'n_fft', n_fft,
 *     '1.0.0', '2.0.0'
 *   );
 *   // Use fftSize in implementation
 * }
 *
 * @example
 * // Multiple renamed parameters
 * function mfcc({ n_mfcc, nMfcc, ...opts }) {
 *   const mfccCount = rename_kw('nMfcc', nMfcc, 'n_mfcc', n_mfcc, '1.0.0', '2.0.0');
 *   return computeMfcc(mfccCount, opts);
 * }
 */
export function rename_kw(
  oldName,
  oldValue,
  newName,
  newValue,
  versionDeprecated,
  versionRemoved
) {
  // Both provided - warn about duplicate
  if (oldValue !== undefined && oldValue !== null &&
      newValue !== undefined && newValue !== null) {
    console.warn(
      `[ParameterWarning] Both '${oldName}' and '${newName}' were provided. ` +
      `Using '${newName}'. The parameter '${oldName}' was deprecated in version ${versionDeprecated} ` +
      `and will be removed in version ${versionRemoved}.`
    );
    return newValue;
  }

  // Only old name provided - warn
  if (oldValue !== undefined && oldValue !== null) {
    console.warn(
      `[DeprecationWarning] Parameter '${oldName}' is deprecated as of version ${versionDeprecated} ` +
      `and will be removed in version ${versionRemoved}. Use '${newName}' instead.`
    );
    return oldValue;
  }

  // Only new name provided or neither - use new value
  return newValue;
}

/**
 * Create a memoized version of a function using WeakMap
 *
 * Similar to wrapper() but uses WeakMap for automatic garbage collection
 * when object keys are no longer referenced elsewhere.
 *
 * @param {Function} fn - Function to memoize
 * @returns {Function} Memoized function
 *
 * @example
 * const memoized = memoize((obj) => expensiveComputation(obj));
 * const result1 = memoized(myObject);
 * const result2 = memoized(myObject);  // Returns cached result
 */
export function memoize(fn) {
  const cache = new WeakMap();
  const primitiveCache = new Map();

  return function(...args) {
    // Handle single object argument with WeakMap
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
      const key = args[0];
      if (cache.has(key)) {
        return cache.get(key);
      }
      const result = fn.call(this, ...args);
      cache.set(key, result);
      return result;
    }

    // Handle primitive arguments or multiple arguments with Map
    const key = JSON.stringify(args);
    if (primitiveCache.has(key)) {
      return primitiveCache.get(key);
    }
    const result = fn.call(this, ...args);
    primitiveCache.set(key, result);
    return result;
  };
}

// Global cache instance for library-wide caching
export const globalCache = new LRUCache(1000);
