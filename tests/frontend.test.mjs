import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const reply = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
const noop = () => {};

test('Friendly frontend keeps discovery, booking, and account actions usable', { timeout: 60_000 }, async suite => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const previousFetch = globalThis.fetch;
  for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'MutationObserver', 'FormData']) globalThis[name] = dom.window[name];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.HTMLElement.prototype.scrollIntoView = noop;
  dom.window.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop });
  const vite = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom' });
  const React = await import('react');
  const { render, screen, cleanup, waitFor } = await import('@testing-library/react');
  suite.afterEach(() => cleanup());
  const { default: userEvent } = await import('@testing-library/user-event');
  const { default: Auth } = await vite.ssrLoadModule('/src/Auth.jsx');
  const { default: TutorProfile } = await vite.ssrLoadModule('/src/TutorProfile.jsx');
  const { default: Home } = await vite.ssrLoadModule('/src/Home.jsx');
  const { default: Messages } = await vite.ssrLoadModule('/src/Messages.jsx');
  const h = React.createElement;
  const user = userEvent.setup({ document: dom.window.document });
  const tutor = { id: 1, name: 'Avery Tutor', language: 'English', flag: '🇨🇦', country: 'Canada', native: 'English (Native)', price: 24, rating: 0, reviews: 0, tag: 'A little confidence, every day', bio: 'Friendly lessons built around your goals and the conversations you want to have.', image: '', isDemo: false, userId: 'tutor-id' };
  try {
    await suite.test('account creation opens directly and password visibility is an explicit toggle', async () => {
      render(h(Auth, { initialMode: 'register', onSuccess: noop }));
      assert.equal(screen.getByRole('tab', { name: 'Create account' }).getAttribute('aria-selected'), 'true');
      assert.ok(screen.getByLabelText('Your name'));
      const password = screen.getByLabelText('Password', { exact: true });
      await user.type(password, 'A-test-password');
      assert.equal(password.type, 'password');
      await user.click(screen.getByRole('button', { name: 'Show password' }));
      assert.equal(password.type, 'text');
      assert.equal(password.value, 'A-test-password');
      await user.click(screen.getByRole('button', { name: 'Hide password' }));
      assert.equal(password.type, 'password');
      await user.click(screen.getByRole('tab', { name: 'Log in', exact: true }));
      assert.equal(screen.queryByLabelText('Your name'), null);
      assert.ok(screen.getByRole('button', { name: /Log in to my space/ }));
      cleanup();
    });

    await suite.test('booking date paging keeps selected day aligned and a booking conflict remains visible', async () => {
      const slots = Array.from({ length: 7 }, (_, index) => {
        const startsAt = new Date(Date.UTC(2031, 0, index + 1, 16)).toISOString();
        return { id: `slot-${index}`, startsAt, endsAt: new Date(Date.parse(startsAt) + 50 * 60000).toISOString() };
      });
      let availabilityCalls = 0;
      const requests = [];
      globalThis.fetch = (path, options = {}) => {
        requests.push({ path, options });
        if (path.endsWith('/availability')) { availabilityCalls += 1; return reply({ slots }); }
        if (path.endsWith('/reviews')) return reply({ reviews: [] });
        if (path === '/api/bookings') return reply({ error: 'That time was just taken. Please choose another.' }, 409);
        throw new Error(`Unexpected test request ${path}`);
      };
      render(h(TutorProfile, { tutor, user: { id: 'student-id', goal: 'Travel conversations' }, onAuth: noop, onMessage: noop, onBooked: noop, onDashboard: noop }));
      await screen.findByRole('button', { name: 'Later available dates' });
      await user.click(screen.getByRole('button', { name: 'Later available dates' }));
      const sixth = new Date(slots[5].startsAt);
      const day = sixth.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
      assert.equal(screen.getByRole('button', { name: day, exact: true }).getAttribute('aria-pressed'), 'true');
      const time = date => new Date(date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      await user.click(screen.getByRole('button', { name: `${time(slots[5].startsAt)} to ${time(slots[5].endsAt)}` }));
      await user.click(screen.getByRole('button', { name: /Reserve my lesson/ }));
      await waitFor(() => assert.ok(availabilityCalls >= 2));
      await screen.findByText('That time was just taken. Please choose another.');
      assert.equal(JSON.parse(requests.find(request => request.path === '/api/bookings').options.body).slotId, 'slot-5');
      assert.equal(screen.getByRole('button', { name: /Choose a time above/ }).disabled, true);
      cleanup();
    });

    await suite.test('tutors are shown six at a time and visible filters send the intended query', async () => {
      const tutors = Array.from({ length: 8 }, (_, index) => ({ ...tutor, id: index + 1, name: `Tutor Person ${index + 1}` }));
      const paths = [];
      globalThis.fetch = path => {
        paths.push(path);
        if (path.startsWith('/api/tutors?')) return reply({ tutors, languages: [{ name: 'English', count: 8 }] });
        throw new Error(`Unexpected test request ${path}`);
      };
      render(h(Home, { user: null, onAuth: noop, onTutor: noop, notice: noop }));
      await screen.findByRole('button', { name: /Show more tutors/ });
      assert.equal(document.querySelectorAll('.coach-card').length, 6);
      await user.click(screen.getByRole('button', { name: /Show more tutors/ }));
      assert.equal(document.querySelectorAll('.coach-card').length, 8);
      await user.selectOptions(screen.getByRole('combobox', { name: /Lesson budget/ }), '25');
      await waitFor(() => assert.ok(paths.some(path => new URL(path, 'http://localhost').searchParams.get('maxPrice') === '25')));
      await user.type(screen.getByRole('searchbox', { name: /Search tutors/ }), 'Avery');
      await waitFor(() => assert.ok(paths.some(path => new URL(path, 'http://localhost').searchParams.get('search') === 'Avery')), { timeout: 1500 });
      cleanup();
    });

    await suite.test('refreshing messages preserves a composed draft', async () => {
      const conversation = { tutorId: 1, learnerId: 'student-id', tutorName: 'Avery Tutor', tutorImage: '' };
      let refreshCount = 0;
      globalThis.fetch = path => {
        if (path === '/api/conversations') return reply({ conversations: [] });
        if (path.startsWith('/api/messages?')) { refreshCount += 1; return reply({ messages: [], tutor }); }
        throw new Error(`Unexpected test request ${path}`);
      };
      render(h(Messages, { user: { id: 'student-id', role: 'learner' }, initialConversation: conversation, onBrowse: noop }));
      await screen.findByText('Break the ice. What would you like to learn?');
      const field = screen.getByLabelText('Your message');
      await user.type(field, 'I would love to practice introductions.');
      await user.click(screen.getByRole('button', { name: 'Refresh conversations' }));
      await waitFor(() => assert.ok(refreshCount >= 2));
      assert.equal(field.value, 'I would love to practice introductions.');
      cleanup();
    });
  } finally {
    cleanup();
    globalThis.fetch = previousFetch;
    await vite.close();
    dom.window.close();
  }
});
