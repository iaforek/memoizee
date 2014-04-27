'use strict';

var toArray      = require('es5-ext/array/to-array')
  , customError  = require('es5-ext/error/custom')
  , defineLength = require('es5-ext/function/_define-length')
  , callable     = require('es5-ext/object/valid-callable')
  , d            = require('d')
  , ee           = require('event-emitter').methods

  , slice = Array.prototype.slice
  , apply = Function.prototype.apply, call = Function.prototype.call
  , create = Object.create, hasOwnProperty = Object.prototype.hasOwnProperty
  , defineProperties = Object.defineProperties
  , on = ee.on, emit = ee.emit, resolveArgs;

resolveArgs = function (args) {
	return this.map(function (r, i) {
		return r ? r(args[i]) : args[i];
	}).concat(slice.call(args, this.length));
};

module.exports = function (original, length, options) {
	var cache = create(null), conf, memLength, get, set, del, clear
	  , getListeners, setListeners, deleteListeners, memoized, resolve, resolvers;
	if (length !== false) memLength = length;
	else if (isNaN(original.length)) memLength = 1;
	else memLength = original.length;

	if (options.normalizer) {
		if (typeof options.normalizer === 'function') {
			set = get = options.normalizer;
		} else {
			get = callable(options.normalizer.get);
			if (options.normalizer.set !== undefined) {
				set = callable(options.normalizer.set);
				del = callable(options.normalizer.delete);
				clear = callable(options.normalizer.clear);
			} else {
				set = get;
			}
		}
	}

	if (options.resolvers != null) {
		resolvers = toArray(options.resolvers);
		resolvers.forEach(function (r) {
			if (r != null) callable(r);
		});
		resolve = resolveArgs.bind(resolvers);
	}

	if (get) {
		memoized = defineLength(function (arg) {
			var id, result, args = arguments;
			if (resolve) args = resolve(args);
			id = get(args);
			if (id !== null) {
				if (hasOwnProperty.call(cache, id)) {
					if (getListeners) conf.emit('get', id, args, this);
					return cache[id];
				}
			}
			if (args.length === 1) result = call.call(original, this, arg);
			else result = apply.call(original, this, args);
			if (id === null) {
				id = get(args);
				if (id !== null) throw customError("Circular invocation", 'CIRCULAR_INVOCATION');
				id = set(args);
			} else if (hasOwnProperty.call(cache, id)) {
				throw customError("Circular invocation", 'CIRCULAR_INVOCATION');
			}
			cache[id] = result;
			if (setListeners) conf.emit('set', id);
			return result;
		}, memLength);
	} else {
		memoized = function (arg) {
			var result, args = arguments;
			if (resolve) {
				args = resolve(arguments);
				arg = args[0];
			}
			if (hasOwnProperty.call(cache, arg)) {
				if (getListeners) conf.emit('get', arg, args, this);
				return cache[arg];
			}
			if (args.length === 1) result = call.call(original, this, arg);
			else result = apply.call(original, this, args);
			if (hasOwnProperty.call(cache, arg)) {
				throw customError("Circular invocation", 'CIRCULAR_INVOCATION');
			}
			cache[arg] = result;
			if (setListeners) conf.emit('set', arg);
			return result;
		};
	}
	conf = {
		original: original,
		memoized: memoized,
		get: function (args) {
			if (resolve) args = resolve(args);
			if (get) return get(args);
			return args[0];
		},
		has: function (id) { return hasOwnProperty.call(cache, id); },
		delete: function (id) {
			var result;
			if (!hasOwnProperty.call(cache, id)) return;
			if (del) del(id);
			result = cache[id];
			delete cache[id];
			if (deleteListeners) conf.emit('delete', id, result);
		},
		clear: function () {
			var oldCache = cache;
			if (clear) clear();
			cache = create(null);
			conf.emit('clear', oldCache);
		},
		on: function (type, listener) {
			if (type === 'get') getListeners = true;
			else if (type === 'set') setListeners = true;
			else if (type === 'delete') deleteListeners = true;
			return on.call(this, type, listener);
		},
		emit: emit,
		updateEnv: function () { original = conf.original; }
	};
	defineProperties(memoized, {
		__memoized__: d(true),
		delete: d(get ? defineLength(function (arg) {
			var id, args = arguments;
			if (resolve) args = resolve(args);
			id = get(args);
			if (id === null) return;
			conf.delete(id);
		}, memLength) : function (arg) {
			if (resolve) arg = resolve(arguments)[0];
			return conf.delete(arg);
		}),
		clear: d(conf.clear)
	});
	return conf;
};