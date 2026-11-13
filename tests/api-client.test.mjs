import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

test('API client preserves cancellation and rejects unusable responses', { timeout: 30_000 }, async suite => {
  const previousFetch = globalThis.fetch;
  const vite = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' });
  const { api } = await vite.ssrLoadModule('/src/api.js');
  try {
    await suite.test('normal JSON success returns the API object', async () => {
      const data = { tutors: [], languages: [] };
      globalThis.fetch = async () => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
      assert.deepEqual(await api('/tutors?'), data);
    });

    await suite.test('a fetch cancellation retains its AbortError identity', async () => {
      const aborted = new DOMException('The request was aborted.', 'AbortError');
      globalThis.fetch = async () => { throw aborted; };
      await assert.rejects(api('/tutors?'), error => error === aborted);
    });

    await suite.test('cancelling after headers rejects body parsing with the same AbortError', async () => {
      const controller = new AbortController();
      const aborted = new DOMException('The response body was aborted.', 'AbortError');
      let bodyStarted;
      const bodyReady = new Promise(resolve => { bodyStarted = resolve; });
      globalThis.fetch = async (_path, { signal }) => ({
        ok: true,
        status: 200,
        json: () => new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(aborted), { once: true });
          bodyStarted();
        }),
      });
      const request = api('/tutors?', { signal: controller.signal });
      await bodyReady;
      controller.abort();
      await assert.rejects(request, error => error === aborted);
    });

    await suite.test('HTTP 200 HTML and malformed JSON reject instead of returning an empty object', async () => {
      for (const [body, contentType] of [['<!doctype html><html>Verbal</html>', 'text/html'], ['{"tutors":', 'application/json']]) {
        globalThis.fetch = async () => new Response(body, { headers: { 'Content-Type': contentType } });
        await assert.rejects(api('/tutors?'), /unexpected response/i);
      }
    });

    await suite.test('HTTP 200 JSON must contain an object', async () => {
      for (const data of [null, 'success', 1, false, []]) {
        globalThis.fetch = async () => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
        await assert.rejects(api('/tutors?'), /unexpected response/i);
      }
    });

    await suite.test('a non-JSON HTTP 404 keeps its status and service fallback', async () => {
      globalThis.fetch = async () => new Response('<html>Not found</html>', { status: 404, headers: { 'Content-Type': 'text/html' } });
      await assert.rejects(api('/missing'), error => {
        assert.equal(error.status, 404);
        assert.match(error.message, /service could not be found/i);
        return true;
      });
    });

    await suite.test('JSON HTTP errors use safe API messages or the generic fallback', async () => {
      for (const [data, message] of [[{ error: 'Please log in.' }, 'Please log in.'], [null, 'Something went wrong. Please try again.'], [{ error: { internal: 'details' } }, 'Something went wrong. Please try again.']]) {
        globalThis.fetch = async () => new Response(JSON.stringify(data), { status: 401, headers: { 'Content-Type': 'application/json' } });
        await assert.rejects(api('/saved'), error => {
          assert.equal(error.status, 401);
          assert.equal(error.message, message);
          return true;
        });
      }
    });
  } finally {
    globalThis.fetch = previousFetch;
    await vite.close();
  }
});
