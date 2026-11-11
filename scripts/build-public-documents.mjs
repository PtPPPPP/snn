import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {startBuiltWorker} from './built-worker.mjs';
import {publicDocumentAsset, publicDocumentRoutes} from '../lib/public-documents.mjs';
import {canCachePublicPage} from '../worker/public-page-cache.mjs';

const client = path.resolve('dist/client');
const headersFile = path.join(client, '_headers');
const marker = '\n# Generated public documents\n';
const existingHeaders = (await readFile(headersFile, 'utf8')).split(marker)[0].trimEnd();
const documents = [];
const worker = await startBuiltWorker();
try {
  for (const route of publicDocumentRoutes) {
    const response = await worker.fetch(new Request(new URL(route, 'https://snnai.cn'), {
      // Always render from this build, even if the command is run twice.
      headers: {accept: 'text/html', 'cache-control': 'no-store'},
    }));
    if (!canCachePublicPage(response)) throw new Error(`Cannot publish the anonymous document for ${route} (HTTP ${response.status})`);
    const html = await response.text();
    if (!/<main\b/i.test(html) || !html.includes('rel="modulepreload"') || !html.includes('</html>')) {
      throw new Error(`Incomplete public document for ${route}`);
    }
    const asset = publicDocumentAsset(route);
    const headers = ['  X-SNN-Document: 1', '  X-Robots-Tag: noindex'];
    for (const [name, value] of response.headers) {
      if (/^(?:vary|link|content-language|content-security-policy(?:-report-only)?|permissions-policy|referrer-policy|cross-origin-[\w-]+|x-(?:frame-options|content-type-options))$/i.test(name)) {
        headers.push(`  ${name}: ${value}`);
      }
    }
    documents.push({route, asset, html, rule: [asset, ...headers].join('\n')});
  }
} finally {
  await worker.close();
}

// The local assets binding watches its directory. Publish the files only after
// the renderer stops, so writing them cannot restart it during the build.
for (const {route, asset, html} of documents) {
  const file = path.join(client, asset);
  await mkdir(path.dirname(file), {recursive: true});
  await writeFile(file, html);
  console.log(`Public document ${route} (${Buffer.byteLength(html)} bytes)`);
}
await writeFile(headersFile, existingHeaders + '\n' + marker + documents.map(doc => doc.rule).join('\n\n') + '\n');
