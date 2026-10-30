import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	FIXTURE_VALUE: { schema: (value) => value }
});
