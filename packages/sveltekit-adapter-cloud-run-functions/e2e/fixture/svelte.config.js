import adapter from '../../index.js';

export default {
	kit: {
		adapter: adapter({
			out: process.env.FIXTURE_OUT,
			precompress: process.env.FIXTURE_PRECOMPRESS !== 'false',
			envPrefix: process.env.FIXTURE_ENV_PREFIX ?? ''
		})
	}
};
