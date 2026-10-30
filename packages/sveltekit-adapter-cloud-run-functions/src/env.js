import process from 'node:process';
import { env_prefix } from '#@genoacms/sveltekit-adapter-cloud-run-functions';

/**
 * @param {string} name
 * @param {any} [fallback]
 */
export function env(name, fallback) {
	const prefixed = env_prefix + name;
	return prefixed in process.env ? process.env[prefixed] : fallback;
}
