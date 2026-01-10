# Test Structure

This directory contains all tests for the magic-proxy project, organized by type and complexity.

## Directory Organization

### `/legacy`
Original tests moved from root test directory. These tests pass and serve as reference implementations. All original tests are preserved here to maintain backward compatibility.

### `/unit`
Small, focused unit tests for individual functions and modules:
- Template rendering (`template.test.ts`)
- Event dispatching (`hostDispatcher.test.ts`)
- Individual utility functions

### `/functional`
Integration and functional tests that verify system behavior:
- Backend plugin functionality (`backend.test.ts`)
- File I/O operations (`traefik-file.test.ts`)
- Application initialization (`index-init.test.ts`)
- End-to-end workflows

### `/resources`
Test fixtures and mock data:
- **`/config`** - Mock configuration files (YAML)
- **`/templates`** - Template files for testing template rendering
- **`/x-magic-proxy`** - Example x-magic-proxy service configurations

### `/helpers`
Utility functions for test setup and mocking:
- Mock creation helpers
- FS mocking utilities
- Test data factories

## Using Mock Helpers

Import from `../helpers/mockHelpers.ts`:

```typescript
import {
  createMockXMagicProxyData,
  createMockHostEntry,
  createMockConfig,
  mockFS,
  mockFileWrite,
  setupFSMocks,
} from '../helpers/mockHelpers';
```

### Common Patterns

#### Creating mock data:
```typescript
const data = createMockXMagicProxyData({ hostname: 'custom.local' });
const entry = createMockHostEntry({ containerName: 'my-app' });
const config = createMockConfig();
```

#### Mocking file operations:
```typescript
beforeEach(() => {
  // Provide templates map. Optionally pass a second argument with config file contents.
  const { readMock, writeMock, cleanup } = setupFSMocks({
    'default': `http:\n  routers: {}`
  }, {
    'basic.yml': `proxyBackend: traefik`,
  });
  // ... tests ...
  cleanup();
});
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run only unit tests
npm test -- test/unit

# Run only functional tests
npm test -- test/functional

# Run only legacy tests
npm test -- test/legacy

# Generate coverage report
npm test -- --coverage
```

## Adding New Tests

1. **Unit tests**: Add to `/unit` for simple, isolated functionality
2. **Functional tests**: Add to `/functional` for integration scenarios
3. **Resources**: Add config/template files to `/resources` subdirectories as needed
4. **Helpers**: Extend `/helpers/mockHelpers.ts` with new factory functions for common test patterns
