import test from 'node:test';
import assert from 'node:assert/strict';
import {canCachePublicPage, publicPageCacheCopy, publicPageCacheKey, publicPageResponse} from '../worker/public-page-cache.mjs';

const request = (path='/', headers={}, method='GET') => new Request(`https://snnai.cn${path}`, {
  method, headers: {accept:'text/html', ...headers},
});

test('only canonical anonymous pages have version-specific keys', () => {
  const home=publicPageCacheKey(request(), 'release-a');
  assert.ok(home);
  assert.notEqual(home.url, publicPageCacheKey(request(), 'release-b').url);
  assert.ok(publicPageCacheKey(request('/learn/neural-networks'), 'release-a'));
  for (const candidate of [
    request('/join/interview'), request('/api/interview/results'), request('/ai'),
    request('/?q=1'), request('/', {cookie:'session=private'}),
    request('/', {authorization:'Bearer private'}), request('/', {rsc:'1'}),
    request('/', {'next-router-state-tree':'private'}),
    request('/', {'cf-access-jwt-assertion':'private'}),
    request('/', {'cache-control':'no-cache'}), request('/', {}, 'POST'),
  ]) assert.equal(publicPageCacheKey(candidate, 'release-a'), null);
  assert.equal(publicPageCacheKey(request(), undefined), null);
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
