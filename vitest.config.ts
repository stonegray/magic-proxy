import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['test/**/*.test.ts', 'test/legacy/**/*.test.ts'],
        setupFiles: ['test/setup/suppressConsole.ts'],
        coverage: {
            provider: 'istanbul',
            reporter: ['text', 'lcov', 'html'],
            all: true,
            include: ['src/**/*.ts'],
            exclude: [
                'src/**/types/**',
                'src/**/*test.ts',
                'test/**',
                'scripts/**',
                'dist/**',
                'node_modules/**'
            ],
            reportsDirectory: 'coverage'
        }
    }
});