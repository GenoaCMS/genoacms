import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('./src', import.meta.url).href).replaceAll('\\', '/');
const handoff = '#@genoacms/sveltekit-adapter-cloud-run-functions';

/** @type {typeof import('./index.js').default} */
export default function (opts = {}) {
	const { out = 'build', precompress = true, envPrefix = '' } = opts;

	return {
		name: '@genoacms/sveltekit-adapter-cloud-run-functions',

		async adapt(builder) {
			fs.rmSync(out, { force: true, recursive: true });

			const base = builder.config.paths.base;
			const client_dir = `${out}/client${base}`;
			const prerendered_dir = `${out}/prerendered${base}`;

			builder.log.minor('Copying assets');
			builder.writeClient(client_dir);
			builder.writePrerendered(prerendered_dir);

			if (precompress) {
				builder.log.minor('Compressing assets');
				await Promise.all([builder.compress(client_dir), builder.compress(prerendered_dir)]);
			}

			const server = builder.getServerDirectory();
			builder.generateServerInstance(`${server}/server.js`);
			builder.copy(server, `${out}/server`);

			fs.writeFileSync(
				`${out}/adapter.js`,
				[
					`import { dirname } from 'node:path';`,
					`import { fileURLToPath } from 'node:url';`,
					`export { server } from './server/server.js';`,
					`export const dir = dirname(fileURLToPath(import.meta.url));`,
					`export const base = ${JSON.stringify(base)};`,
					`export const app_path = ${JSON.stringify(builder.getAppPath())};`,
					`export const prerendered = new Set(${JSON.stringify(builder.prerendered.paths)});`,
					`export const origin = ${JSON.stringify(builder.config.paths.origin)};`,
					`export const env_prefix = ${JSON.stringify(envPrefix)};`
				].join('\n')
			);

			fs.writeFileSync(`${out}/index.js`, `export * from './server/adapter-index.js';\n`);
			fs.writeFileSync(`${out}/handler.js`, `export * from './server/handler.js';\n`);
		},

		supports: {
			read: () => true
		},

		vite: {
			plugins: {
				post: [
					{
						name: 'vite-plugin-sveltekit-adapter-cloud-run-functions',
						apply: 'build',
						config(config) {
							const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
							const no_external = Array.isArray(config.ssr?.noExternal)
								? config.ssr.noExternal
								: [];

							// ADP-3
							return {
								ssr: {
									external: Object.keys(pkg.dependencies || {}).filter(
										(dep) =>
											!no_external.some((rule) =>
												typeof rule === 'string' ? rule === dep : rule.test(dep)
											)
									),
									noExternal: true
								},
								environments: {
									ssr: {
										build: {
											sourcemap: true,
											rolldownOptions: {
												input: {
													'adapter-index': `${src}/index.js`,
													'adapter-env': `${src}/env.js`,
													handler: `${src}/handler.js`
												},
												external: [handoff],
												output: {
													paths: { [handoff]: '../adapter.js' },
													chunkFileNames: (chunk) =>
														chunk.moduleIds.some((id) => id.startsWith(src))
															? 'adapter-[name].js'
															: 'chunks/[name].js'
												}
											}
										}
									}
								}
							};
						}
					}
				]
			}
		}
	};
}
