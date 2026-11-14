import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { workspaceDestination, workspaceHome } from '../src/roles.js';
const noop = () => {};
const reply = data => Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }));
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/b9kAAAAASUVORK5CYII=';

test('workspace destinations keep tutor and admin routes separate from student onboarding', () => {
  assert.equal(workspaceHome({ role: 'tutor' }), 'growth');
  assert.equal(workspaceDestination({ role: 'tutor' }, 'dashboard'), 'growth');
  assert.equal(workspaceDestination({ role: 'admin' }, 'dashboard'), 'admin');
  assert.equal(workspaceDestination({ role: 'learner' }, 'dashboard'), 'dashboard');
  assert.equal(workspaceDestination({ role: 'learner' }, 'growth'), 'dashboard');
});

test('role workspaces, public tutor links and profile photo controls remain usable', { timeout: 60000 }, async suite => {
  const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost/#/dashboard', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'Element', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'MutationObserver', 'FormData', 'location', 'history']) globalThis[key] = dom.window[key];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.scrollTo = noop; HTMLElement.prototype.scrollIntoView = noop;
  window.matchMedia = () => ({ matches: false });
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  const oldFetch = globalThis.fetch;
  const vite = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' });
  const React = await import('react');
  const { render, screen, cleanup, waitFor } = await import('@testing-library/react');
  const { default: userEvent } = await import('@testing-library/user-event');
  const { App } = await vite.ssrLoadModule('/src/main.jsx');
  const { default: ProfilePhoto, prepareProfilePhoto } = await vite.ssrLoadModule('/src/ProfilePhoto.jsx');
  const { default: TutorGrowth } = await vite.ssrLoadModule('/src/TutorGrowth.jsx');
  const h = React.createElement; const user = userEvent.setup({ document: dom.window.document });
  const tutor = { id: 7, userId: 'other-tutor', name: 'Avery Tutor', language: 'English', price: 25, tag: 'A friendly conversation', bio: 'Friendly conversation lessons with practical goals and plenty of speaking time.', native: 'English', rating: 0, reviews: 0, image: '', isDemo: false };
  const account = role => ({ id: 'account-id', name: 'Test Person', email: 'test@example.invalid', goal: 'Conversation', role, image: '' });
  function requests(role) {
    return path => {
      if (path === '/api/session') return reply({ user: account(role) });
      if (path === '/api/teaching/growth') return reply({ tutor: null });
      if (path === '/api/admin/overview') return reply({ stats: { users: 0, students: 0, tutors: 0, admins: 0, bookings: 0, upcomingLessons: 0 }, users: [], tutors: [], bookings: [] });
      if (path === '/api/tutors/7') return reply({ tutor });
      if (path.endsWith('/availability')) return reply({ slots: [] });
      if (path.endsWith('/reviews')) return reply({ reviews: [] });
      if (path === '/api/saved') return reply({ tutorIds: [] });
      if (path.startsWith('/api/tutors?')) return reply({ tutors: [], languages: [] });
      throw new Error(`Unexpected request ${path}`);
    };
  }
  try {
    await suite.test('a tutor opening the old student dashboard gets growth tools', async () => {
      history.replaceState(null, '', '#/dashboard'); globalThis.fetch = requests('tutor');
      render(h(App));
      await screen.findByRole('heading', { name: /Good teaching deserves/ });
      await waitFor(() => assert.equal(location.hash, '#/growth'));
      assert.equal(screen.queryByText('Just start with a hello.'), null);
      assert.equal(screen.queryByRole('button', { name: /My lessons/ }), null);
      assert.equal(screen.queryByRole('button', { name: /Meet your next tutor/ }), null);
      cleanup();
    });
    await suite.test('an admin opening the old student dashboard sees community management', async () => {
      history.replaceState(null, '', '#/dashboard'); globalThis.fetch = requests('admin');
      render(h(App)); await screen.findByRole('heading', { name: 'Admin overview.' });
      await waitFor(() => assert.equal(location.hash, '#/admin'));
      assert.equal(screen.queryByRole('button', { name: /My lessons/ }), null);
      assert.equal(screen.queryByRole('button', { name: /Start teaching/ }), null);
      cleanup();
    });
    await suite.test('a shared profile link opens the requested tutor without redirecting a tutor viewer', async () => {
      history.replaceState(null, '', '#/tutor/7'); globalThis.fetch = requests('tutor');
      render(h(App));
      await screen.findByRole('dialog', { name: 'Tutor profile and lesson booking' });
      assert.ok(screen.getByRole('heading', { name: /Hi, I’m Avery Tutor/ }));
      assert.equal(location.hash, '#/tutor/7');
      assert.equal(screen.queryByRole('button', { name: /Reserve my lesson/ }), null);
      await user.click(screen.getAllByRole('button', { name: 'Close dialog' })[0]);
      await screen.findByRole('heading', { name: /Good teaching deserves/ });
      cleanup();
    });
    await suite.test('an eligible tutor can activate the boost and sees its active state', async () => {
      let activations = 0;
      const boostState = () => ({ active: activations > 0, canBoost: activations === 0, endsAt: new Date(Date.now() + 86400000).toISOString(), nextAvailableAt: new Date(Date.now() + 7 * 86400000).toISOString() });
      globalThis.fetch = (path, options) => {
        if (path === '/api/teaching/growth') return reply({ tutor: { ...tutor, active: true }, stats: { savedBy: 0, learners: 0, completedLessons: 0, openSlots: 2 }, boost: boostState(), checklist: [{ id: 'photo', label: 'Add a clear profile photo', complete: true }], profilePath: '/#/tutor/7' });
        assert.equal(path, '/api/teaching/boost'); assert.equal(options.method, 'POST'); activations += 1; return reply({ boost: boostState() });
      };
      render(h(TutorGrowth, { user: account('tutor'), onTeaching: noop, onSettings: noop, onPreview: noop }));
      const button = await screen.findByRole('button', { name: 'Activate free boost' });
      assert.equal(button.disabled, false); await user.click(button);
      await screen.findByText(/Boost active until/);
      assert.equal(activations, 1); assert.equal(screen.queryByRole('button', { name: 'Activate free boost' }), null);
      cleanup();
    });
    await suite.test('a chosen photo is prepared, previewed and saved without losing account details', async () => {
      globalThis.createImageBitmap = async () => ({ width: 640, height: 480, close: noop });
      window.HTMLCanvasElement.prototype.getContext = () => ({ fillRect: noop, drawImage: noop });
      window.HTMLCanvasElement.prototype.toDataURL = () => png.replace('image/png', 'image/jpeg');
      let updated; let payload;
      globalThis.fetch = (path, options) => { assert.equal(path, '/api/account/photo'); payload = JSON.parse(options.body); return reply({ image: '/api/profile-photos/account-id?v=1' }); };
      render(h(ProfilePhoto, { user: account('tutor'), onUpdated: value => { updated = value; }, notify: noop }));
      const file = new window.File(['photo'], 'photo.png', { type: 'image/png' });
      await user.upload(screen.getByLabelText('Choose a profile photo'), file);
      await screen.findByAltText('New profile photo preview');
      await user.click(screen.getByRole('button', { name: 'Save photo' }));
      await screen.findByText('Your profile photo has been saved.');
      assert.ok(payload.image.startsWith('data:image/jpeg;base64,'));
      assert.equal(updated.role, 'tutor'); assert.equal(updated.image, '/api/profile-photos/account-id?v=1');
      await assert.rejects(prepareProfilePhoto(new window.File(['svg'], 'photo.svg', { type: 'image/svg+xml' })), /JPEG, PNG, or WebP/);
      cleanup();
    });
  } finally { cleanup(); globalThis.fetch = oldFetch; await vite.close(); dom.window.close(); }
});
