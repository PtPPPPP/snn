import test from 'node:test';
import assert from 'node:assert/strict';
import {canCachePublicPage, publicDocumentFor, publicPageCacheCopy, publicPageCacheKey, publicPageResponse, readPublicDocument} from '../worker/public-page-cache.mjs';
import {publicDocumentRoutes} from '../lib/public-documents.mjs';

const request = (path='/', headers={}, method='GET') => new Request(`https://snnai.cn${path}`, {
  method, headers: {accept:'text/html', ...headers},
});

test('only canonical anonymous pages have version-specific keys', () => {
  const home=publicPageCacheKey(request(), 'release-a');
  assert.ok(home);
  assert.notEqual(home.url, publicPageCacheKey(request(), 'release-b').url);
  for (const route of publicDocumentRoutes) assert.ok(publicPageCacheKey(request(route), 'release-a'));
  for (const candidate of [
    request('/join/interview'), request('/api/interview/results'), request('/ai.rsc'),
    request('/?q=1'), request('/', {cookie:'session=private'}),
    request('/', {authorization:'Bearer private'}), request('/', {rsc:'1'}),
    request('/', {'next-router-state-tree':'private'}),
    request('/', {'cf-access-jwt-assertion':'private'}),
    request('/', {'cache-control':'no-cache'}), request('/', {}, 'POST'),
  ]) assert.equal(publicPageCacheKey(candidate, 'release-a'), null);
  assert.equal(publicPageCacheKey(request(), undefined), null);
});

test('document prefetch and revalidation use the release asset only for anonymous HTML', () => {
  const path = '/learn/neural-networks';
  const asset = publicDocumentFor(request(path));
  assert.ok(asset);
  assert.equal(publicDocumentFor(request(path, {'sec-purpose':'prefetch'})), asset);
  assert.equal(publicDocumentFor(request(path, {'cache-control':'max-age=0'})), asset);
  for (const candidate of [
    request('/ai?thread=private'), request('/ai', {cookie:'session=active'}),
    request(path, {accept:'text/x-component'}), request(path, {rsc:'1'}),
    request('/_staff/interview/login'), request(path, {'cache-control':'no-store'}),
    request('/api/ai/chat'), request(path, {}, 'POST'),
  ]) assert.equal(publicDocumentFor(candidate), null);
});

test('static documents keep validators, and a missing or unexpected asset falls back to SSR', async () => {
  const original = request('/ai', {'if-none-match':'"release"', 'x-test':'ignored'});
  const path = publicDocumentFor(original);
  for (const status of [200, 304]) {
    const document = await readPublicDocument(original, path, {async fetch(assetRequest) {
      assert.equal(new URL(assetRequest.url).pathname, path);
      assert.deepEqual([...assetRequest.headers], [['if-none-match','"release"']]);
      return new Response(status === 304 ? null : '<main>SNN AI</main>', {
        status, headers:{etag:'"release"', 'x-snn-document':'1', 'x-robots-tag':'noindex'},
      });
    }});
    assert.equal(document.status, status);
    assert.equal(document.headers.get('x-snn-page-cache'), 'STATIC');
    assert.equal(document.headers.get('etag'), '"release"');
    assert.equal(document.headers.has('x-robots-tag'), false);
    assert.match(document.headers.get('vary'), /Cookie/);
    assert.equal(await document.text(), status === 200 ? '<main>SNN AI</main>' : '');
  }
  for (const status of [200, 404]) {
    assert.equal(await readPublicDocument(original, path, {fetch:async()=>new Response('other', {status})}), null);
  }
});

test('only successful public HTML without cookies or private directives is stored', () => {
  const html=(headers={}, status=200) => new Response('<main>public</main>', {
    status, headers:{'content-type':'text/html; charset=utf-8', ...headers},
  });
  assert.equal(canCachePublicPage(html()), true);
  assert.equal(canCachePublicPage(html({'set-cookie':'session=private'})), false);
  assert.equal(canCachePublicPage(html({'cache-control':'private, no-store'})), false);
  assert.equal(canCachePublicPage(html({'cache-control':'max-age=0'})), false);
  assert.equal(canCachePublicPage(html({'content-security-policy':"script-src 'nonce-private'"})), false);
  assert.equal(canCachePublicPage(html({vary:'*'})), false);
  assert.equal(canCachePublicPage(html({}, 500)), false);
  assert.equal(canCachePublicPage(new Response('{}', {headers:{'content-type':'application/json'}})), false);
});

test('a cache copy preserves the streamed page while browser HTML revalidates', async () => {
  const original=new Response('<main>课程</main>', {headers:{'content-type':'text/html'}});
  const stored=publicPageCacheCopy(original);
  const outgoing=publicPageResponse(original, 'MISS');
  assert.equal(stored.headers.get('cache-control'), 'public, max-age=300');
  assert.equal(outgoing.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
  assert.equal(outgoing.headers.get('x-snn-page-cache'), 'MISS');
  assert.equal(await stored.text(), '<main>课程</main>');
  assert.equal(await outgoing.text(), '<main>课程</main>');
});
