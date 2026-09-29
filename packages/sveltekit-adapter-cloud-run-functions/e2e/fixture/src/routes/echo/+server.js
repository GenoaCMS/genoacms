import { json } from '@sveltejs/kit';
import { parse } from '@polka/url';

export async function POST({ request, url }) {
	return json({
		href: url.href,
		path: parse({ url: url.pathname }).pathname,
		body: await request.text()
	});
}
