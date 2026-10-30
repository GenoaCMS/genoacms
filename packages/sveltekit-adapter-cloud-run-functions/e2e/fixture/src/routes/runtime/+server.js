import { json } from '@sveltejs/kit';
import { FIXTURE_VALUE } from '$app/env/private';

export function GET() {
	return json({
		crypto: typeof globalThis.crypto,
		File: typeof globalThis.File,
		value: FIXTURE_VALUE ?? null
	});
}
