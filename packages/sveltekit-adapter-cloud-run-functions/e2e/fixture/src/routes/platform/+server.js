import { json } from '@sveltejs/kit';

export function GET({ platform }) {
	return json({
		keys: Object.keys(platform ?? {}),
		method: platform?.req?.method ?? null,
		check: platform?.req?.headers?.['x-check'] ?? null,
		readable: typeof platform?.req?.on === 'function'
	});
}
