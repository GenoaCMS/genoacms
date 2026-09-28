import 'SHIMS';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import sirv from 'sirv';
import { fileURLToPath } from 'node:url';
import { parse as polka_url_parser } from '@polka/url';
import { setResponse, createReadableStream } from '@sveltejs/kit/node';
import { Server } from 'SERVER';
import { manifest, prerendered, base } from 'MANIFEST';
import { env } from 'ENV';
import { requestUrl, clientAddress, parseXffDepth } from './request.js';

/* global ENV_PREFIX */

const server = new Server(manifest);

// ADP-7
const origin = env('ORIGIN', undefined);
const xff_depth = parseXffDepth(env('XFF_DEPTH', undefined));

const dir = path.dirname(fileURLToPath(import.meta.url));

const asset_dir = `${dir}/client${base}`;

await server.init({
	env: process.env,
	read: (file) => createReadableStream(`${asset_dir}/${file}`)
});

/**
 * @param {string} path
 * @param {boolean} client
 */
function serve(path, client = false) {
	return (
		fs.existsSync(path) &&
		sirv(path, {
			etag: true,
			gzip: true,
			brotli: true,
			setHeaders:
				client &&
				((res, pathname) => {
					if (pathname.startsWith(`/${manifest.appPath}/immutable/`) && res.statusCode === 200) {
						res.setHeader('cache-control', 'public,max-age=31536000,immutable');
					}
				})
		})
	);
}

// ADP-5
/** @returns {import('polka').Middleware} */
function serve_prerendered() {
	const handler = serve(path.join(dir, 'prerendered'));

	return (req, res, next) => {
		let { pathname, search, query } = polka_url_parser(req);

		try {
			pathname = decodeURIComponent(pathname);
		} catch {
			// ADP-5
		}

		if (prerendered.has(pathname)) {
			return handler(req, res, next);
		}

		let location = pathname.at(-1) === '/' ? pathname.slice(0, -1) : pathname + '/';
		if (prerendered.has(location)) {
			if (query) location += search;
			res.writeHead(308, { location }).end();
		} else {
			next();
		}
	};
}

// ADP-5
/**
 * @param {import('http').IncomingMessage & { rawBody?: Uint8Array<ArrayBuffer> }} cloudRunRequest
 * @returns {Request}
 */
function parseRequest(cloudRunRequest) {
	const href = requestUrl(cloudRunRequest, origin);
	const request = new Request(href, {
		method: cloudRunRequest.method,
		headers: parseHeaders(cloudRunRequest.headers),
		body: cloudRunRequest.rawBody ?? null
	});
	return request;
}
/**
 * @param {import('http').IncomingHttpHeaders} headers
 * @returns
 */
function parseHeaders(headers) {
	/** @type {Record<string, string>} */
	const finalHeaders = {};

	for (const [key, value] of Object.entries(headers)) {
		finalHeaders[key] = Array.isArray(value) ? value.join(',') : value;
	}

	return finalHeaders;
}

/** @type {import('polka').Middleware} */
const ssr = async (req, res) => {
	/** @type {Request} */
	let request;

	try {
		request = parseRequest(req);
	} catch {
		res.statusCode = 400;
		res.end('Bad Request');
		return;
	}

	setResponse(
		res,
		await server.respond(request, {
			platform: { req },
			getClientAddress: () => clientAddress(req, xff_depth)
		})
	);
};

/** @param {import('polka').Middleware[]} handlers */
function sequence(handlers) {
	/** @type {import('polka').Middleware} */
	return (req, res, next) => {
		/**
		 * @param {number} i
		 * @returns {ReturnType<import('polka').Middleware>}
		 */
		function handle(i) {
			if (i < handlers.length) {
				return handlers[i](req, res, () => handle(i + 1));
			} else {
				return next();
			}
		}

		return handle(0);
	};
}

export const handler = sequence(
	[
		serve(path.join(dir, 'client'), true),
		serve(path.join(dir, 'static')),
		serve_prerendered(),
		ssr
	].filter(Boolean)
);
