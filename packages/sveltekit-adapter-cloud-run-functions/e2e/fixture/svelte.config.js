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

export default {
	kit: {
		adapter: adapter(adapterOptions()),
		paths: { base: process.env.FIXTURE_BASE ?? '' }
	}
};
