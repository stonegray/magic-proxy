import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: 'module',
            },
            globals: {
                ...globals.node,
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
        },
        rules: {
            ...tseslint.configs.recommended.rules,
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'warn',
        },
    },
    {
        // Test files often use `any` and import helpers that are only used for spying.
        files: ['test/**/*.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off'
        }
    },
    {
        ignores: ['dist/**', 'node_modules/**'],
    },
];