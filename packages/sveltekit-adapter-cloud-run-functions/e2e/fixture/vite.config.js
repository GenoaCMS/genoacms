import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import adapter from '../../index.js';

/** @returns {Record<string, unknown>} */
function adapterOptions() {
	const options = {};
	if (process.env.FIXTURE_OUT !== undefined) options.out = process.env.FIXTURE_OUT;
	if (process.env.FIXTURE_PRECOMPRESS !== undefined)
		options.precompress = process.env.FIXTURE_PRECOMPRESS !== 'false';
	if (process.env.FIXTURE_ENV_PREFIX !== undefined)
		options.envPrefix = process.env.FIXTURE_ENV_PREFIX;
	return options;
}

/** @returns {Record<string, string>} */
function paths() {
	const paths = { base: process.env.FIXTURE_BASE ?? '' };
	if (process.env.FIXTURE_ORIGIN !== undefined) paths.origin = process.env.FIXTURE_ORIGIN;
	return paths;
}

export default defineConfig({
	plugins: [
		await sveltekit({
			adapter: adapter(adapterOptions()),
			paths: paths()
		})
	]
});
