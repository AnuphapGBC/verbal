import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const noop = () => {};
const reply = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
const admin = { id: '11111111-1111-4111-8111-111111111111', name: 'Avery Admin', email: 'avery@example.invalid', role: 'admin', image: '' };
const student = { id: '22222222-2222-4222-8222-222222222222', name: 'Morgan Learner', email: 'morgan@example.invalid', role: 'learner', image: '', isTest: false };
const sessionId = '33333333-3333-4333-8333-333333333333';
const lesson = overrides => ({
  id: sessionId, title: 'Introductions together', status: 'active',
  notes: 'Introduce yourself, then ask your teacher one question.', notesVersion: 1,
  admin, student, canManage: false, messages: [],
  createdAt: '2031-01-01T16:00:00.000Z', updatedAt: '2031-01-01T16:00:00.000Z',
  ...overrides,
});

test('practice lessons keep the admin as teacher and preserve student work', { timeout: 60_000 }, async suite => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/#/practice', pretendToBeVisual: true });
  const previousFetch = globalThis.fetch;
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'Element', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'MutationObserver', 'FormData', 'location', 'history']) globalThis[key] = dom.window[key];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.scrollTo = noop;
  HTMLElement.prototype.scrollIntoView = noop;
  window.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop });
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  const vite = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' });
  const React = await import('react');
  const { render, screen, cleanup, waitFor, within } = await import('@testing-library/react');
  const { default: userEvent } = await import('@testing-library/user-event');
  const { default: Practice } = await vite.ssrLoadModule('/src/Practice.jsx');
  const { default: PracticeRoom } = await vite.ssrLoadModule('/src/PracticeRoom.jsx');
  const { default: AdminStudentPicker } = await vite.ssrLoadModule('/src/AdminStudentPicker.jsx');
  const { App } = await vite.ssrLoadModule('/src/main.jsx');
  const h = React.createElement;
  const user = userEvent.setup({ document: dom.window.document });
  suite.afterEach(() => cleanup());

  try {
    await suite.test('an admin chooses a real student and starts a lesson without changing accounts', async () => {
      const requests = [];
      let opened;
      globalThis.fetch = (path, options = {}) => {
        requests.push({ path, options });
        if (path.startsWith('/api/admin/students?')) return reply({ students: [student], hasMore: false, nextOffset: null });
        if (path === '/api/practice/sessions' && options.method === 'POST') return reply({ session: lesson({ canManage: true, title: 'Travel introductions' }) }, 201);
        if (path === '/api/practice/sessions') return reply({ sessions: [] });
        throw new Error(`Unexpected request ${path}`);
      };
      render(h(Practice, { user: admin, onOpenSession: id => { opened = id; } }));
      await user.click(await screen.findByRole('button', { name: `Choose ${student.name}` }));
      const title = screen.getByLabelText('Practice title');
      await user.clear(title);
      await user.type(title, 'Travel introductions');
      await user.click(screen.getByRole('button', { name: 'Start practice' }));
      await waitFor(() => assert.equal(opened, sessionId));
      const creation = requests.find(request => request.options.method === 'POST');
      assert.deepEqual(JSON.parse(creation.options.body), { studentId: student.id, title: 'Travel introductions' });
      assert.equal(admin.role, 'admin');
      assert.equal(requests.some(request => /\/auth\//.test(request.path)), false);
    });

    await suite.test('student search and paging can reach someone beyond the first page', async () => {
      const laterStudent = { ...student, id: '44444444-4444-4444-8444-444444444444', name: 'Taylor Student', email: 'taylor@example.invalid' };
      const queries = [];
      let selected;
      globalThis.fetch = path => {
        assert.ok(path.startsWith('/api/admin/students?'));
        const query = new URL(path, 'http://localhost').searchParams;
        queries.push({ search: query.get('search'), offset: query.get('offset') });
        return query.get('search') || query.get('offset') === '50'
          ? reply({ students: [laterStudent], hasMore: false, nextOffset: null })
          : reply({ students: [student], hasMore: true, nextOffset: 50 });
      };
      render(h(AdminStudentPicker, { onSelect: value => { selected = value; } }));
      await user.click(await screen.findByRole('button', { name: 'Load more students' }));
      await screen.findByRole('button', { name: `Choose ${laterStudent.name}` });
      assert.ok(screen.getByRole('button', { name: `Choose ${student.name}` }));
      await user.type(screen.getByRole('searchbox', { name: 'Find a student' }), laterStudent.email);
      await waitFor(() => assert.ok(queries.some(query => query.search === laterStudent.email && query.offset === '0')), { timeout: 1500 });
      await waitFor(() => assert.equal(screen.queryByRole('button', { name: `Choose ${student.name}` }), null));
      await user.click(await screen.findByRole('button', { name: `Choose ${laterStudent.name}` }));
      assert.equal(selected.id, laterStudent.id);
      assert.ok(queries.some(query => query.offset === '50'));
    });

    await suite.test('a student sees assigned lessons without student search or lesson creation controls', async () => {
      const paths = [];
      globalThis.fetch = path => {
        paths.push(path);
        assert.equal(path, '/api/practice/sessions');
        return reply({ sessions: [lesson()] });
      };
      render(h(Practice, { user: student, onOpenSession: noop }));
      await screen.findByText('Introductions together');
      assert.equal(screen.queryByLabelText('Practice title'), null);
      assert.equal(screen.queryByRole('button', { name: 'Start practice' }), null);
      assert.equal(screen.queryByRole('button', { name: /^Choose / }), null);
      assert.equal(paths.some(path => path.startsWith('/api/admin/')), false);
    });

    await suite.test('the student reads the teacher board without teacher-only controls', async () => {
      globalThis.fetch = path => {
        assert.equal(path, `/api/practice/sessions/${sessionId}`);
        return reply({ session: lesson() });
      };
      render(h(PracticeRoom, { user: student, sessionId, onBack: noop, onEnded: noop }));
      await screen.findByText('Introduce yourself, then ask your teacher one question.');
      assert.equal(screen.queryByRole('button', { name: 'Save lesson board' }), null);
      assert.equal(screen.queryByRole('button', { name: 'End practice' }), null);
      assert.equal(screen.getByLabelText('Your response').disabled, false);
    });

    await suite.test('a response that fails to send remains in the composer and can be retried', async () => {
      const draft = 'Hello, I am Morgan. What do you enjoy teaching?';
      let attempts = 0;
      globalThis.fetch = (path, options = {}) => {
        if (path === `/api/practice/sessions/${sessionId}/messages`) {
          assert.equal(options.method, 'POST');
          assert.deepEqual(JSON.parse(options.body), { body: draft });
          attempts += 1;
          if (attempts === 1) return reply({ error: 'Your response could not be sent. Try again.' }, 503);
          return reply({ message: { id: 'message-1', senderId: student.id, senderName: student.name, senderRole: 'learner', body: draft, createdAt: '2031-01-01T16:01:00.000Z' } }, 201);
        }
        assert.equal(path, `/api/practice/sessions/${sessionId}`);
        return reply({ session: lesson() });
      };
      render(h(PracticeRoom, { user: student, sessionId, onBack: noop, onEnded: noop }));
      const field = await screen.findByLabelText('Your response');
      await user.type(field, draft);
      await user.click(screen.getByRole('button', { name: 'Send response' }));
      await screen.findByText('Your response could not be sent. Try again.');
      assert.equal(field.value, draft);
      assert.equal(screen.getByRole('button', { name: 'Send response' }).disabled, false);
      await user.click(screen.getByRole('button', { name: 'Send response' }));
      await waitFor(() => assert.equal(field.value, ''));
      await screen.findByText(draft);
      assert.equal(attempts, 2);
    });

    await suite.test('an ended lesson retains its board and disables new responses', async () => {
      globalThis.fetch = path => {
        assert.equal(path, `/api/practice/sessions/${sessionId}`);
        return reply({ session: lesson({ status: 'ended', endedAt: '2031-01-01T16:30:00.000Z' }) });
      };
      render(h(PracticeRoom, { user: student, sessionId, onBack: noop, onEnded: noop }));
      await screen.findByText('Introduce yourself, then ask your teacher one question.');
      assert.equal(screen.getByLabelText('Your response').disabled, true);
      assert.equal(screen.getByRole('button', { name: 'Send response' }).disabled, true);
    });

    await suite.test('a lesson board version conflict leaves the admin draft intact', async () => {
      const draft = 'New lesson goal: describe your most recent journey.';
      let saved;
      let reads = 0;
      globalThis.fetch = (path, options = {}) => {
        assert.equal(path, `/api/practice/sessions/${sessionId}`);
        if (options.method === 'PATCH') {
          saved = JSON.parse(options.body);
          return reply({ error: 'The lesson board changed. Refresh before saving again.' }, 409);
        }
        reads += 1;
        return reply({ session: lesson({ canManage: true, ...(reads > 1 ? { notes: 'Updated in another teacher window.', notesVersion: 2 } : {}) }) });
      };
      render(h(PracticeRoom, { user: admin, sessionId, onBack: noop, onEnded: noop }));
      const field = await screen.findByLabelText('Lesson board');
      await user.clear(field);
      await user.type(field, draft);
      await user.click(screen.getByRole('button', { name: 'Save lesson board' }));
      await screen.findByText('The lesson board changed. Refresh before saving again.');
      await waitFor(() => assert.ok(reads > 1));
      assert.equal(field.value, draft);
      assert.deepEqual(saved, { notes: draft, notesVersion: 1 });
    });

    await suite.test('a shared lesson route keeps the admin in the teaching room', async () => {
      history.replaceState(null, '', `#/practice/${sessionId}`);
      globalThis.fetch = path => {
        if (path === '/api/session') return reply({ user: admin });
        if (path === `/api/practice/sessions/${sessionId}`) return reply({ session: lesson({ canManage: true }) });
        throw new Error(`Unexpected request ${path}`);
      };
      render(h(App));
      await screen.findByRole('button', { name: 'Save lesson board' });
      assert.equal(location.hash, `#/practice/${sessionId}`);
      const navigation = screen.getByRole('navigation', { name: 'Your workspace' });
      assert.ok(within(navigation).getByRole('button', { name: /Practice/ }));
      assert.ok(within(navigation).getByRole('button', { name: /Admin overview/ }));
      assert.equal(within(navigation).queryByRole('button', { name: /Start teaching/ }), null);
    });

    await suite.test('a learner can open Practice from their own workspace navigation', async () => {
      history.replaceState(null, '', '#/practice');
      const paths = [];
      globalThis.fetch = path => {
        paths.push(path);
        if (path === '/api/session') return reply({ user: student });
        if (path === '/api/practice/sessions') return reply({ sessions: [lesson()] });
        throw new Error(`Unexpected request ${path}`);
      };
      render(h(App));
      await screen.findByRole('heading', { name: 'Your practice space.' });
      await screen.findByText('Introductions together');
      const navigation = screen.getByRole('navigation', { name: 'Your workspace' });
      const practice = within(navigation).getByRole('button', { name: /Practice/ });
      assert.equal(practice.getAttribute('aria-current'), 'page');
      assert.equal(location.hash, '#/practice');
      assert.equal(paths.some(path => path.startsWith('/api/admin/')), false);
    });
  } finally {
    cleanup();
    globalThis.fetch = previousFetch;
    await vite.close();
    dom.window.close();
  }
});
