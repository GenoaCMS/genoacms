import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = join(packageDir, 'e2e', 'fixture');
const outRoot = join(packageDir, 'e2e', '.out');
const defaultOut = join(fixtureDir, 'build');
const e2eModules = join(packageDir, 'e2e', 'node_modules');
const vite = join(packageDir, 'node_modules', 'vite', 'bin', 'vite.js');
const functionsFramework = join(
	packageDir,
	'node_modules',
	'@google-cloud',
	'functions-framework',
	'build',
	'src',
	'main.js'
);

const FUNCTION_ENTRY = `import { handler } from './index.js'

export function app (req, res) {
  handler(req, res, undefined)
}
`;

const FORWARDED = { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'cms.example' };
const XFF = '203.0.113.9, 198.51.100.7';

/** @type {Array<() => void>} */
const running = [];

/** @param {string} command @param {string[]} args @param {string} cwd @param {Record<string, string>} env */
function run(command, args, cwd, env = {}) {
	const result = spawnSync(command, args, {
		cwd,
		env: { ...process.env, ...env },
		encoding: 'utf-8'
	});
	if (result.status !== 0)
		throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr}`);
}

/** @param {string} name @param {Record<string, string>} env */
function buildFixture(name, env) {
	const out = join(outRoot, name);
	rmSync(out, { recursive: true, force: true });
	run(process.execPath, [vite, 'build'], fixtureDir, { FIXTURE_OUT: out, ...env });
	writeFileSync(join(out, 'function.js'), FUNCTION_ENTRY);
	return out;
}

/** @returns {Promise<number>} */
function freePort() {
	return new Promise((resolve) => {
		const server = createServer().listen(0, () => {
			const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
			server.close(() => resolve(port));
		});
	});
}

/** @param {string} out @param {number} port @param {Record<string, string>} env */
function spawnFunction(out, port, env) {
	const child = spawn(
		process.execPath,
		[functionsFramework, '--target=app', `--source=${join(out, 'function.js')}`, `--port=${port}`],
		{ env: { ...process.env, ...env } }
	);
	let output = '';
	child.stdout.on('data', (chunk) => (output += chunk));
	child.stderr.on('data', (chunk) => (output += chunk));
	const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
	running.push(() => child.kill());
	return { exited, output: () => output };
}

/** @param {string} url @param {Promise<unknown>} exited */
async function waitUntilServing(url, exited) {
	let stopped = false;
	exited.then(() => (stopped = true));
	while (!stopped) {
		try {
			await fetch(url);
			return;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
	}
	throw new Error('the function exited before serving');
}

/** @param {string} out @param {Record<string, string>} [env] */
async function serve(out, env = {}) {
	const port = await freePort();
	const url = `http://localhost:${port}`;
	const { exited } = spawnFunction(out, port, env);
	await waitUntilServing(url, exited);
	return url;
}

/** @param {string} out @param {Record<string, string>} env */
async function startupFailure(out, env) {
	const { exited, output } = spawnFunction(out, await freePort(), env);
	return { code: await exited, output: output() };
}

/** @param {string} dir @returns {string[]} */
function filesUnder(dir) {
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath, entry.name));
}

/** @param {string} url @param {Record<string, string>} [headers] */
async function echo(url, headers = {}) {
	const response = await fetch(`${url}/echo`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: '{"sent":true}'
	});
	return response.json();
}

/** @param {Record<string, string>} env */
function buildFixtureIntoDefaultOut(env) {
	mkdirSync(defaultOut, { recursive: true });
	writeFileSync(join(defaultOut, 'stale.txt'), 'stale\n');
	run(process.execPath, [vite, 'build'], fixtureDir, env);
	writeFileSync(join(defaultOut, 'function.js'), FUNCTION_ENTRY);
	return defaultOut;
}

const STATIC_FILES = [
	['/favicon.ico', 'ICO\n'],
	['/robots.txt', 'User-agent: *\n']
];

const WITHOUT_CRYPTO_AND_FILE =
	'--import=data:text/javascript,delete%20globalThis.crypto;delete%20globalThis.File';

let buildA = '';
let buildB = '';
let buildC = '';

// ADP-3
function installDeepDependency() {
	cpSync(join(packageDir, 'e2e', 'deep-dependency'), join(e2eModules, 'genoacms-e2e-deep'), {
		recursive: true
	});
}

beforeAll(() => {
	run('pnpm', ['run', 'build'], packageDir);
	installDeepDependency();
	buildA = buildFixture('a', {});
	buildB = buildFixture('b', { FIXTURE_PRECOMPRESS: 'false', FIXTURE_ENV_PREFIX: 'APP_' });
	buildC = buildFixtureIntoDefaultOut({ FIXTURE_BASE: '/base' });
}, 240_000);

afterAll(() => {
	rmSync(defaultOut, { recursive: true, force: true });
	rmSync(e2eModules, { recursive: true, force: true });
});

afterEach(() => {
	while (running.length > 0) running.pop()?.();
});

describe('the adapter output', () => {
	it('ADP-1, ADP-2: writes client assets, prerendered pages and the runtime files into out, precompressed', () => {
		const files = filesUnder(buildA);
		const immutable = files.filter((file) => file.includes(join('client', '_app', 'immutable')));
		expect(immutable.some((file) => file.endsWith('.js'))).toBe(true);
		expect(immutable.some((file) => file.endsWith('.js.gz'))).toBe(true);
		expect(immutable.some((file) => file.endsWith('.js.br'))).toBe(true);
		for (const file of ['about.html', 'about.html.gz', 'about.html.br']) {
			expect(existsSync(join(buildA, 'prerendered', file))).toBe(true);
		}
		for (const file of ['env.js', 'handler.js', 'index.js', 'shims.js']) {
			expect(existsSync(join(buildA, file))).toBe(true);
		}
	});

	it('ADP-1: writes no compressed variants without precompress', () => {
		const compressed = filesUnder(buildB).filter((file) => /\.(gz|br)$/.test(file));
		expect(compressed).toEqual([]);
	});

	it("ADP-3: bundles the server, keeping the app's dependencies external", async () => {
		const { manifest, prerendered, base } = await import(join(buildA, 'server', 'manifest.js'));
		expect(manifest).toBeTypeOf('object');
		expect(prerendered.has('/about')).toBe(true);
		expect(base).toBe('');
		const server = filesUnder(join(buildA, 'server'))
			.filter((file) => file.endsWith('.js'))
			.map((file) => readFileSync(file, 'utf-8'))
			.join('\n');
		expect(server).toMatch(/from ['"]@polka\/url['"]/);
	});

	it('ADP-1, ADP-2: defaults out, precompress and envPrefix, empties out, and honors base', async () => {
		expect(existsSync(join(buildC, 'handler.js'))).toBe(true);
		expect(existsSync(join(buildC, 'stale.txt'))).toBe(false);
		const immutable = filesUnder(join(buildC, 'client', 'base', '_app', 'immutable'));
		expect(immutable.some((file) => file.endsWith('.js'))).toBe(true);
		expect(immutable.some((file) => file.endsWith('.js.gz'))).toBe(true);
		expect(immutable.some((file) => file.endsWith('.js.br'))).toBe(true);
		expect(existsSync(join(buildC, 'client', 'base', 'genoacms.txt'))).toBe(true);
		for (const file of ['about.html', 'about.html.gz', 'about.html.br']) {
			expect(existsSync(join(buildC, 'prerendered', 'base', file))).toBe(true);
		}
		const { base } = await import(join(buildC, 'server', 'manifest.js'));
		expect(base).toBe('/base');
		const url = await serve(buildC, { ORIGIN: 'https://origin.example' });
		const file = await fetch(`${url}/base/genoacms.txt`);
		expect(file.status).toBe(200);
		expect(await file.text()).toBe('static\n');
		const about = await fetch(`${url}/base/about`);
		expect(about.status).toBe(200);
		expect(await about.text()).toContain('<h1>prerendered</h1>');
		expect((await echo(`${url}/base`)).href).toBe('https://origin.example/base/echo');
	});

	it('ADP-3: keeps deep imports external, and writes sourcemaps and chunks/', async () => {
		const serverDir = join(buildA, 'server');
		const files = filesUnder(serverDir);
		const server = files
			.filter((file) => file.endsWith('.js'))
			.map((file) => readFileSync(file, 'utf-8'))
			.join('\n');
		expect(server).toMatch(/from ['"]genoacms-e2e-deep\/deep['"]/);
		expect(server).not.toContain("'deep import'");
		expect(files.some((file) => file.endsWith('.js.map'))).toBe(true);
		expect(
			files.some((file) => file.startsWith(join(serverDir, 'chunks') + sep) && file.endsWith('.js'))
		).toBe(true);
		const deep = await fetch(`${await serve(buildA)}/deep`);
		expect(deep.status).toBe(200);
		expect(await deep.text()).toBe('deep import');
	});
});

describe('the served function', () => {
	it('ADP-4: serves a server-rendered page through the exported handler', async () => {
		const response = await fetch(`${await serve(buildA)}/`);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain('<h1>server-rendered</h1>');
	});

	it('ADP-5: serves immutable client assets with a one-year cache, precompressed on request', async () => {
		const url = await serve(buildA);
		const asset = filesUnder(join(buildA, 'client'))
			.find((file) => file.includes(join('_app', 'immutable')) && file.endsWith('.js'))
			?.slice(join(buildA, 'client').length);
		const response = await fetch(`${url}${asset}`, { headers: { 'accept-encoding': 'br' } });
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('public,max-age=31536000,immutable');
		expect(response.headers.get('content-encoding')).toBe('br');
	});

	it('ADP-5: serves static files and prerendered pages, and redirects the other trailing-slash form with 308', async () => {
		const url = await serve(buildA);
		const file = await fetch(`${url}/genoacms.txt`);
		expect(file.status).toBe(200);
		expect(await file.text()).toBe('static\n');
		const about = await fetch(`${url}/about`);
		expect(about.status).toBe(200);
		expect(await about.text()).toContain('<h1>prerendered</h1>');
		const redirect = await fetch(`${url}/about/`, { redirect: 'manual' });
		expect(redirect.status).toBe(308);
		expect(redirect.headers.get('location')).toBe('/about');
	});

	it('ADP-5: builds the request URL from forwarded headers and passes the body', async () => {
		const response = await echo(await serve(buildA), FORWARDED);
		expect(response.href).toBe('https://cms.example/echo');
		expect(response.body).toBe('{"sent":true}');
	});

	it('ADP-5, ADP-7: takes the request URL from ORIGIN over forwarded headers', async () => {
		const response = await echo(
			await serve(buildA, { ORIGIN: 'https://origin.example' }),
			FORWARDED
		);
		expect(response.href).toBe('https://origin.example/echo');
	});

	it('ADP-6: returns the X-Forwarded-For entry XFF_DEPTH positions from the right', async () => {
		const address = async (/** @type {Record<string, string>} */ env) =>
			fetch(`${await serve(buildA, env)}/address`, { headers: { 'x-forwarded-for': XFF } });
		expect(await (await address({})).text()).toBe('198.51.100.7');
		expect(await (await address({ XFF_DEPTH: '2' })).text()).toBe('203.0.113.9');
		expect((await address({ XFF_DEPTH: '3' })).status).toBe(500);
	});

	it('ADP-6: falls back to the socket address without X-Forwarded-For', async () => {
		const response = await fetch(`${await serve(buildA)}/address`);
		expect(['127.0.0.1', '::1', '::ffff:127.0.0.1']).toContain(await response.text());
	});

	it('ADP-7: fails at startup on an XFF_DEPTH that is not a positive integer', async () => {
		const { code, output } = await startupFailure(buildA, { XFF_DEPTH: 'abc' });
		expect(code).not.toBe(0);
		expect(output).toContain("XFF_DEPTH must be a positive integer, not 'abc'");
	});

	it('ADP-1, ADP-7: reads prefixed variables with envPrefix, and fails at startup on an unknown prefixed one', async () => {
		const response = await echo(await serve(buildB, { APP_ORIGIN: 'https://prefixed.example' }));
		expect(response.href).toBe('https://prefixed.example/echo');
		const { code } = await startupFailure(buildB, { APP_UNKNOWN: '1' });
		expect(code).not.toBe(0);
	});

	it('ADP-4: installs the shims and initializes with process.env', async () => {
		const url = await serve(buildA, {
			NODE_OPTIONS: WITHOUT_CRYPTO_AND_FILE,
			FIXTURE_VALUE: 'from process.env'
		});
		const response = await fetch(`${url}/runtime`);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			crypto: 'object',
			File: 'function',
			value: 'from process.env'
		});
	});

	it('DEP-10, ADP-5: with IGNORED_ROUTES empty, serves /favicon.ico and /robots.txt through the handler', async () => {
		const served = await serve(buildA, { IGNORED_ROUTES: '' });
		for (const [path, content] of STATIC_FILES) {
			const response = await fetch(`${served}${path}`);
			expect(response.status).toBe(200);
			expect(await response.text()).toBe(content);
		}
		const ignoring = await serve(buildA);
		for (const [path] of STATIC_FILES) {
			expect((await fetch(`${ignoring}${path}`)).status).toBe(404);
		}
	});

	it('ADP-5: keeps the query string on a 308, and marks only immutable assets immutable', async () => {
		const url = await serve(buildA);
		const redirect = await fetch(`${url}/about/?x=1&y=2`, { redirect: 'manual' });
		expect(redirect.status).toBe(308);
		expect(redirect.headers.get('location')).toBe('/about?x=1&y=2');
		for (const path of ['/genoacms.txt', '/_app/version.json', '/about']) {
			const response = await fetch(`${url}${path}`);
			expect(response.status).toBe(200);
			expect(response.headers.get('cache-control') ?? '').not.toContain('immutable');
		}
	});

	it('ADP-5: answers 400 for a URL that cannot be parsed', async () => {
		const response = await fetch(`${await serve(buildA)}/`, {
			headers: { 'x-forwarded-host': 'bad host' }
		});
		expect(response.status).toBe(400);
		expect(response.statusText).toBe('Bad Request');
	});

	it('ADP-6: passes the request as platform.req', async () => {
		const response = await fetch(`${await serve(buildA)}/platform`, {
			headers: { 'x-check': 'node request' }
		});
		expect(await response.json()).toEqual({
			keys: ['req'],
			method: 'GET',
			check: 'node request',
			readable: true
		});
	});
});
