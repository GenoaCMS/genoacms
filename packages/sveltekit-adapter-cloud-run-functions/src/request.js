// GD5

// ADP-7
/**
 * @param {string | undefined} value
 * @returns {number}
 */
export function parseXffDepth(value) {
	if (value === undefined) return 1;
	if (/^[1-9]\d*$/.test(value)) return Number(value);
	throw new Error(`XFF_DEPTH must be a positive integer, not '${value}'`);
}

// ADP-7, ADP-8
/**
 * @param {Record<string, string | undefined>} env
 * @param {string} prefix
 * @returns {{ xffDepth: number }}
 */
export function readStartupEnvironment(env, prefix) {
	refuseOrigin(env, prefix);
	refuseUnknownPrefixed(env, prefix);
	return { xffDepth: parseXffDepth(env[prefix + 'XFF_DEPTH']) };
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} prefix
 */
function refuseOrigin(env, prefix) {
	if (Object.hasOwn(env, prefix + 'ORIGIN')) {
		throw new Error(
			"ORIGIN is no longer read; set the origin at build time with paths.origin (the gcp target's origin option)"
		);
	}
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} prefix
 */
function refuseUnknownPrefixed(env, prefix) {
	if (!prefix) return;
	for (const name of Object.keys(env)) {
		if (name.startsWith(prefix) && name !== prefix + 'XFF_DEPTH') {
			throw new Error(
				`You should change envPrefix (${prefix}) to avoid conflicts with existing environment variables — unexpectedly saw ${name}`
			);
		}
	}
}

// ADP-5
/**
 * @param {import('http').IncomingMessage} req
 * @param {string | undefined} origin
 * @returns {string}
 */
export function requestUrl(req, origin) {
	return new URL(withoutTrailingSlash(origin ?? forwardedOrigin(req)) + (req.url || '/')).href;
}

/**
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
function forwardedOrigin(req) {
	const protocol = req.headers['x-forwarded-proto'] || 'http';
	const hostname = req.headers['x-forwarded-host'] || req.headers['host'];
	return `${protocol}://${hostname}`;
}

/**
 * @param {string} origin
 * @returns {string}
 */
function withoutTrailingSlash(origin) {
	return origin.endsWith('/') ? origin.slice(0, -1) : origin;
}

// ADP-6
/**
 * @param {import('http').IncomingMessage} req
 * @param {number} depth
 * @returns {string | undefined}
 */
export function clientAddress(req, depth) {
	const header = req.headers['x-forwarded-for'];
	const joined = Array.isArray(header) ? header.join(',') : header;
	if (joined === undefined) return req.socket?.remoteAddress;
	const entries = joined
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry !== '');
	if (depth > entries.length) {
		throw new Error(`XFF_DEPTH is ${depth}, but X-Forwarded-For has ${entries.length} entries`);
	}
	return entries[entries.length - depth];
}
