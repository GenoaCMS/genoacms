import { text } from '@sveltejs/kit';
import { deep } from 'genoacms-e2e-deep/deep';

export function GET() {
	return text(deep);
}
