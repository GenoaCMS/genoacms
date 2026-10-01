import { afterEach, describe, expect, it, vi } from 'vitest';
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
	it('ADP-7: parses XFF_DEPTH, defaulting to 1 and refusing anything but a positive integer', () => {
		expect(parseXffDepth(undefined)).toBe(1);
		expect(parseXffDepth('2')).toBe(2);
		for (const value of ['0', '-1', '1.5', 'x']) {
			expect(() => parseXffDepth(value)).toThrow(
				`XFF_DEPTH must be a positive integer, not '${value}'`
			);
		}
	});

	it('ADP-5: builds the URL from forwarded headers, falling back to http and host', () => {
		expect(
			requestUrl(
				request({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'cms.example.com' }),
				undefined
			)
		).toBe('https://cms.example.com/a?b=1');
		expect(requestUrl(request({ host: 'fn.example' }), undefined)).toBe('http://fn.example/a?b=1');
	});

	it('ADP-5: builds the URL from ORIGIN when set, ignoring forwarded headers', () => {
		const req = request({ 'x-forwarded-proto': 'http', 'x-forwarded-host': 'other.example' });
		expect(requestUrl(req, 'https://cms.example.com')).toBe('https://cms.example.com/a?b=1');
	});

	it('ADP-6: takes the X-Forwarded-For entry XFF_DEPTH positions from the right', () => {
		const req = request({ 'x-forwarded-for': '203.0.113.9, 198.51.100.7' });
		expect(clientAddress(req, 1)).toBe('198.51.100.7');
		expect(clientAddress(req, 2)).toBe('203.0.113.9');
	});

	it('ADP-6: refuses a depth beyond the entries present', () => {
		const req = request({ 'x-forwarded-for': '203.0.113.9, 198.51.100.7' });
		expect(() => clientAddress(req, 3)).toThrow(
			'XFF_DEPTH is 3, but X-Forwarded-For has 2 entries'
		);
	});

	it('ADP-6: falls back to the socket address without X-Forwarded-For', () => {
		expect(clientAddress(request({}), 1)).toBe('192.0.2.1');
	});

	it('ADP-5: joins header arrays with a comma, and answers 400 for a URL that cannot be parsed', () => {
		expect(
			requestUrl(
				request({ 'x-forwarded-proto': ['https'], 'x-forwarded-host': ['a.example', 'b.example'] }),
				undefined
			)
		).toBe('https://a.example,b.example/a?b=1');
		expect(requestUrl(request({ host: ['fn.example'] }), undefined)).toBe(
			'http://fn.example/a?b=1'
		);
		expect(() => new URL(requestUrl(request({ host: 'bad host' }), undefined))).toThrow();
	});

	it('ADP-6: drops empty X-Forwarded-For entries, and passes the request as platform.req', () => {
		const req = request({ 'x-forwarded-for': ' , 203.0.113.9,, 198.51.100.7 , ' });
		expect(clientAddress(req, 1)).toBe('198.51.100.7');
		expect(clientAddress(req, 2)).toBe('203.0.113.9');
		expect(() => clientAddress(req, 3)).toThrow(
			'XFF_DEPTH is 3, but X-Forwarded-For has 2 entries'
		);
		const joined = request({ 'x-forwarded-for': ['203.0.113.9', '', '198.51.100.7'] });
		expect(clientAddress(joined, 2)).toBe('203.0.113.9');
		expect(() => clientAddress(joined, 3)).toThrow(
			'XFF_DEPTH is 3, but X-Forwarded-For has 2 entries'
		);
	});

	describe('under envPrefix', () => {
		const globals = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (globalThis));

		afterEach(() => {
			delete process.env.APP_XFF_DEPTH;
			delete process.env.XFF_DEPTH;
			delete globals.ENV_PREFIX;
			vi.resetModules();
		});

		it('ADP-7: reads XFF_DEPTH under envPrefix', async () => {
			globals.ENV_PREFIX = 'APP_';
			process.env.XFF_DEPTH = '5';
			process.env.APP_XFF_DEPTH = '2';
			vi.resetModules();
			const { env } = await import('../src/env.js');
			expect(parseXffDepth(env('XFF_DEPTH', undefined))).toBe(2);
		});
	});
});
