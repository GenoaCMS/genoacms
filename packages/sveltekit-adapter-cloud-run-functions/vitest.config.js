import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
	test: {
		exclude: mode === 'e2e' ? configDefaults.exclude : [...configDefaults.exclude, 'e2e/**']
	}
}));
