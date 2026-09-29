import { text } from '@sveltejs/kit';

export function GET({ getClientAddress }) {
	return text(getClientAddress());
}
