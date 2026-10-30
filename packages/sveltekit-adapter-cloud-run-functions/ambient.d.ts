declare module '#@genoacms/sveltekit-adapter-cloud-run-functions' {
	import { Server } from '@sveltejs/kit';

	export const server: Server;
	export const dir: string;
	export const base: string;
	export const app_path: string;
	export const prerendered: Set<string>;
	export const origin: string | undefined;
	export const env_prefix: string;
}

declare namespace App {
	export interface Platform {
		/**
		 * The original Node request object (https://nodejs.org/api/http.html#class-httpincomingmessage)
		 */
		req: import('http').IncomingMessage;
	}
}
