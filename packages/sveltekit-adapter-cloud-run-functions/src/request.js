/**
 * Request URL and client address, kept free of the build-time placeholders (SERVER, MANIFEST) so they
 * can be tested without a build.
 */

/**
 * Parses XFF_DEPTH. A bad value throws, so a misconfigured function fails at startup rather than
 * trusting the wrong address.
 *
 * @param {string | undefined} value
 * @returns {number}
 */
export function parseXffDepth(value) {
	if (value === undefined) return 1;
	if (/^[1-9]\d*$/.test(value)) return Number(value);
	throw new Error(`XFF_DEPTH must be a positive integer, not '${value}'`);
}

/**
 * The request URL. A configured origin wins over forwarded headers, which a proxy such as Firebase
 * Hosting may set to something other than what the browser used.
 *
 * @param {import('http').IncomingMessage} req
 * @param {string | undefined} origin
 * @returns {string}
 */
export function requestUrl(req, origin) {
	if (typeof origin === 'string') return new URL(req.url || '', origin).href;
	const protocol = req.headers['x-forwarded-proto'] || 'http';
	const hostname = req.headers['x-forwarded-host'] || req.headers['host'];
	return new URL(req.url || '', `${protocol}://${hostname}`).href;
}

/**
 * The client address: the X-Forwarded-For entry `depth` positions from the right. Entries further left
 * were sent by the client and can be forged.
 *
 * @param {import('http').IncomingMessage} req
 * @param {number} depth
 * @returns {string | undefined}
 */
export function clientAddress(req, depth) {
	const header = req.headers['x-forwarded-for'];
	const joined = Array.isArray(header) ? header.join(',') : header;
	if (!joined) return req.socket?.remoteAddress;
	const entries = joined
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry !== '');
	if (depth > entries.length) {
		throw new Error(`XFF_DEPTH is ${depth}, but X-Forwarded-For has ${entries.length} entries`);
	}
	return entries[entries.length - depth];
}
