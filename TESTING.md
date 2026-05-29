# Frontend Testing

This document describes the testing setup for the Plane web application.

## Setup

The project uses [Vitest](https://vitest.dev/) as the test framework along with React Testing Library for component testing.

### Dependencies

- **vitest** - Fast unit test framework
- **@testing-library/react** - React component testing utilities
- **@testing-library/jest-dom** - Custom matchers for DOM nodes
- **jsdom** - DOM implementation for Node.js

### Configuration

- `vitest.config.ts` - Vitest configuration
- `vitest.setup.ts` - Global test setup: jest-dom matchers, an in-memory `localStorage`/`sessionStorage` (jsdom does not provide one), and per-test DOM + storage cleanup

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage
```

## Test Files

Test files are colocated with the source files they test:

```
core/
├── hooks/
│   ├── use-label-auto-refresh.ts
│   └── use-label-auto-refresh.test.ts
└── store/
    ├── label.store.ts
    └── label.store.test.ts
```

## Writing Tests

### Hook Tests

```typescript
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

describe("useMyHook", () => {
  it("should return expected value", async () => {
    const { result } = renderHook(() => useMyHook());

    await waitFor(() => {
      expect(result.current.value).toBe("expected");
    });
  });
});
```

### Component Tests

```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

## Coverage

Tests currently cover:

- ✅ `useLabelAutoRefresh` hook - Auto-refresh interval, enable/disable, and hidden-tab behavior
- ✅ `LabelStore.refreshProjectLabels` - Merge/prune reconcile logic

## Future Work

- Add component tests for UI components
- Add integration tests for full workflows
- Increase coverage to 80%+
- Add E2E tests with Playwright

## Contributing

Per `CONTRIBUTING.md`:

> All features or bug fixes must be tested by one or more specs (unit-tests).

When adding new features:

1. Write tests alongside your code
2. Ensure tests pass before committing
3. Aim for meaningful coverage, not just high percentages
