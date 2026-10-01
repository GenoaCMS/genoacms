import { json } from '@sveltejs/kit';

export function GET({ request }) {
	return json({ setCookie: request.headers.get('set-cookie') });
}
