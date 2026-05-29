import * as matchers from "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, expect } from "vitest";

// Add jest-dom matchers
expect.extend(matchers);

// jsdom does not provide a Storage implementation, so install an in-memory
// one that actually persists within a test. A no-op stub would silently drop
// writes and make any code that reads back what it wrote behave incorrectly.
class InMemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

global.localStorage = new InMemoryStorage();
global.sessionStorage = new InMemoryStorage();

// Reset DOM and storage between tests for isolation
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
