/** @type { import("eslint").Linter.Config } */
module.exports = {
	root: true,
	extends: [
		'standard',
		'eslint:recommended',
		'plugin:svelte/recommended',
		'plugin:@typescript-eslint/recommended'
	],
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint'],
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2020,
		extraFileExtensions: ['.svelte']
	},
	env: {
		browser: true,
		es2017: true,
		node: true
	},
	overrides: [
		{
			files: ['*.svelte'],
			parser: 'svelte-eslint-parser',
			parserOptions: {
				ts: '@typescript-eslint/parser',
				js: 'espree',
				parser: '@typescript-eslint/parser'
			}
		}
	]
};
