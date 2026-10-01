import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export function GET() {
	return json({
		crypto: typeof globalThis.crypto,
		File: typeof globalThis.File,
		value: env.FIXTURE_VALUE ?? null
	});
}
