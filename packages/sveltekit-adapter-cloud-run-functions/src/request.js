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

// ADP-5
/**
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

// ADP-6
/**
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
