import { describe, expect, it } from 'vitest';
import { clientAddress, parseXffDepth, requestUrl } from '../src/request.js';

/**
 * @param {Record<string, string | string[]>} headers
 * @param {string} [url]
 * @returns {any}
 */
const request = (headers, url = '/a?b=1') => ({
	url,
	headers,
	socket: { remoteAddress: '192.0.2.1' }
});

describe('request', () => {
	it('parses XFF_DEPTH, defaulting to 1 and refusing anything but a positive integer', () => {
		expect(parseXffDepth(undefined)).toBe(1);
		expect(parseXffDepth('2')).toBe(2);
		for (const value of ['0', '-1', '1.5', 'x']) {
			expect(() => parseXffDepth(value)).toThrow(
				`XFF_DEPTH must be a positive integer, not '${value}'`
			);
		}
	});

	it('builds the URL from forwarded headers, falling back to http and host', () => {
		expect(
			requestUrl(
				request({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'cms.example.com' }),
				undefined
			)
		).toBe('https://cms.example.com/a?b=1');
		expect(requestUrl(request({ host: 'fn.example' }), undefined)).toBe('http://fn.example/a?b=1');
	});

	it('builds the URL from ORIGIN when set, ignoring forwarded headers', () => {
		const req = request({ 'x-forwarded-proto': 'http', 'x-forwarded-host': 'other.example' });
		expect(requestUrl(req, 'https://cms.example.com')).toBe('https://cms.example.com/a?b=1');
	});

	it('takes the X-Forwarded-For entry XFF_DEPTH positions from the right', () => {
		const req = request({ 'x-forwarded-for': '203.0.113.9, 198.51.100.7' });
		expect(clientAddress(req, 1)).toBe('198.51.100.7');
		expect(clientAddress(req, 2)).toBe('203.0.113.9');
	});

	it('refuses a depth beyond the entries present', () => {
		const req = request({ 'x-forwarded-for': '203.0.113.9, 198.51.100.7' });
		expect(() => clientAddress(req, 3)).toThrow(
			'XFF_DEPTH is 3, but X-Forwarded-For has 2 entries'
		);
	});

	it('falls back to the socket address without X-Forwarded-For', () => {
		expect(clientAddress(request({}), 1)).toBe('192.0.2.1');
	});
});
