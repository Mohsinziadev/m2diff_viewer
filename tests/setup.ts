import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// jsdom has no layout: give scroll containers a viewport so virtualised lists render rows.
// (Skipped in node-environment tests such as the SSR suite.)
if (typeof HTMLElement !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return (this as HTMLElement).classList?.contains('m2d-scroller') ? 400 : 0;
    },
  });
}
