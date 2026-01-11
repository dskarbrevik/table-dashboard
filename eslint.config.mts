import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
	{
		ignores: [
			"node_modules/**",
			"dist/**",
			"esbuild.config.mjs",
			"eslint.config.mts",
			"eslint.config.js",
			"version-bump.mjs",
			"versions.json",
			"main.js",
			"jest.config.cjs",
			"tests/**",
		],
	},
	// TypeScript recommended rules with type checking
	...tseslint.configs.recommendedTypeChecked,
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: true,
				tsconfigRootDir: __dirname,
			},
		},
		plugins: {
			'@typescript-eslint': tseslint.plugin,
			obsidianmd,
		},
		rules: {
			// TypeScript rules that catch the bot's issues
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/require-await': 'error',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			
			// General JS rules
			'no-case-declarations': 'error',
			
			// Obsidian-specific rules
			'obsidianmd/ui/sentence-case': 'error',
			'obsidianmd/no-sample-code': 'error',
			'obsidianmd/sample-names': 'error',
			'obsidianmd/validate-manifest': 'error',
			'obsidianmd/detach-leaves': 'error',
			'obsidianmd/hardcoded-config-path': 'error',
			'obsidianmd/no-forbidden-elements': 'error',
			'obsidianmd/no-plugin-as-component': 'error',
			'obsidianmd/no-tfile-tfolder-cast': 'error',
			'obsidianmd/no-view-references-in-plugin': 'error',
			'obsidianmd/no-static-styles-assignment': 'error',
			'obsidianmd/object-assign': 'error',
			'obsidianmd/commands/no-command-in-command-id': 'error',
			'obsidianmd/commands/no-command-in-command-name': 'error',
			'obsidianmd/commands/no-default-hotkeys': 'error',
			'obsidianmd/commands/no-plugin-id-in-command-id': 'error',
			'obsidianmd/commands/no-plugin-name-in-command-name': 'error',
			'obsidianmd/settings-tab/no-manual-html-headings': 'error',
			'obsidianmd/settings-tab/no-problematic-settings-headings': 'error',
		},
	},
);
