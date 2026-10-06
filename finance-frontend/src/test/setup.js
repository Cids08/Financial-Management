import '@testing-library/react'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom implements neither of these, and ResponsiveTable mounts a
// ResizeObserver as soon as it renders a table (the batch-approval wizard's
// Step 1 does). Provide inert stubs so components can mount.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false },
  })
}

// Testing Library's auto-cleanup only registers through a global afterEach;
// do it explicitly so nothing leaks between tests.
afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})