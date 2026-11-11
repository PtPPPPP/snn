// These exact routes render the same initial document for every anonymous visitor.
// Conversations, model state and lesson controls are initialized in the browser.
export const publicDocumentRoutes = Object.freeze([
  '/', '/learn/neural-networks', '/ai',
  '/play/rocket', '/play/rocket/explain', '/play/rocket/train',
]);

/** @param {string} pathname */
export function publicDocumentAsset(pathname) {
  if (!publicDocumentRoutes.includes(pathname)) return null;
  return '/_snn/documents' + (pathname === '/' ? '/index' : pathname) + '.page';
}
