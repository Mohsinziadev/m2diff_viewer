import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { App } from './src/App';

/** Used by scripts/build-site.mjs to prerender the landing page. */
export function render() {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
