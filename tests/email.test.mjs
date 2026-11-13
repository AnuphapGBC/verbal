import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEmail } from '../server/email-templates.js';
import { emailStatus, sendNotification, verifyEmailConnection } from '../server/email.js';

const env = {
  MAIL_ENABLED: 'true', SMTP_USER: 'verbal.notifications@gmail.com',
  SMTP_PASS: 'abcd efgh ijkl mnop', APP_ORIGIN: 'https://verbal.app', NODE_ENV: 'production',
};
const notification = { to: 'learner@inbox.com', type: 'welcome', data: { name: 'Learner' } };

test('mail remains explicitly opt-in without constructing an SMTP transport', async () => {
  let calls = 0;
  for (const value of [undefined, '', 'false', 'TRUE', true]) {
    const disabled = { ...env, MAIL_ENABLED: value };
    assert.equal(emailStatus(disabled).status, 'disabled');
    assert.deepEqual(await sendNotification(notification, { env: disabled, createTransport() { calls++; } }), { sent: false, reason: 'disabled' });
  }
  assert.equal(calls, 0);
});

test('Gmail configuration rejects ordinary passwords and alternate or injected senders', async () => {
  let calls = 0;
  for (const change of [
    { SMTP_PASS: '' }, { SMTP_PASS: 'regular-password!' }, { SMTP_PASS: '"abcdefghijklmnop"' },
    { SMTP_PASS: 'abcdefghijklmno' }, { SMTP_PASS: 'abcdefghijklmnopq' }, { SMTP_USER: 'sender@work.com' },
    { SMTP_USER: 'Sender <sender@gmail.com>' }, { SMTP_USER: 'sender@gmail.com\r\nBcc: hidden@inbox.com' },
    { SMTP_USER: 'one@gmail.com,two@gmail.com' },
  ]) {
    const invalid = { ...env, ...change };
    assert.equal(emailStatus(invalid).configured, false);
    assert.deepEqual(await sendNotification(notification, { env: invalid, createTransport() { calls++; } }), { sent: false, reason: 'missing_credentials' });
  }
  assert.equal(calls, 0);
  assert.deepEqual(emailStatus(env), { provider: 'gmail', sender: env.SMTP_USER, enabled: true, configured: true, status: 'ready', required: [], credentialIssue: null });
  assert.doesNotMatch(JSON.stringify(emailStatus(env)), /abcd|efgh|pass/i);
  assert.deepEqual(emailStatus({}).required, ['SMTP_USER', 'SMTP_PASS']);
});

test('copied Google app password whitespace is normalized and diagnostics reveal only state', async () => {
  const copied = '\r\n abcd\u00a0efgh\tijkl\nmnop \r\n';
  let receivedPassword;
  assert.equal(emailStatus({ ...env, SMTP_PASS: copied }).credentialIssue, null);
  assert.deepEqual(await verifyEmailConnection({
    env: { ...env, SMTP_PASS: copied },
    createTransport(options) {
      receivedPassword = options.auth.pass;
      return { async verify() {}, close() {} };
    },
  }), { verified: true });
  assert.equal(receivedPassword, 'abcdefghijklmnop');
  for (const SMTP_PASS of [undefined, '', ' \r\n\u00a0\t']) {
    const status = emailStatus({ ...env, SMTP_PASS });
    assert.equal(status.credentialIssue, 'missing');
    assert.equal(status.configured, false);
  }
  for (const SMTP_PASS of ['secret-punctuation!', '"abcdefghijklmnop"', 'abcdefghijklmnopq']) {
    const invalid = { ...env, SMTP_PASS };
    const status = emailStatus(invalid);
    assert.equal(status.credentialIssue, 'invalid_format');
    const result = await verifyEmailConnection({ env: invalid, createTransport() { throw new Error('Must not connect'); } });
    assert.equal(result.reason, 'invalid_password_format');
    assert.equal(result.verified, false);
    const response = JSON.stringify({ status, result });
    assert.ok(!response.includes(SMTP_PASS));
    assert.doesNotMatch(response, /secret-punctuation|abcdefghijklmnop|passwordLength|credentialLength/);
    assert.deepEqual(Object.keys(status).sort(), ['configured', 'credentialIssue', 'enabled', 'provider', 'required', 'sender', 'status']);
  }
});

test('format verification returns only fixed corrective hints without contacting SMTP', async t => {
  let calls = 0;
  const logs = [];
  t.mock.method(console, 'warn', (...values) => logs.push(values));
  const examples = [
    ['SMTP_PASS=abcdefghijklmnop', 'assignment_prefix', /Remove the SMTP_PASS= prefix/],
    [' smtp_pass = abcd efgh ijkl mnop\n', 'assignment_prefix', /Remove the SMTP_PASS= prefix/],
    ['"abcdefghijklmnop"', 'quoted_value', /Remove any surrounding quotes/],
    ["'abcdefghijklmnop", 'quoted_value', /Remove any surrounding quotes/],
    ['abcdefghijklmnop\u201d', 'quoted_value', /Remove any surrounding quotes/],
    ['abcdefghijklmn!p', 'unsupported_characters', /Generate a Google app password/],
    ['abcdefghijklmn\u200bop', 'unsupported_characters', /Generate a Google app password/],
    ['abcdefghijklmn\u00f8p', 'unsupported_characters', /Generate a Google app password/],
    ['abcdefghijklmno', 'wrong_length', /complete 16-character Google app password/],
    ['abcdefghijklmnopq', 'wrong_length', /complete 16-character Google app password/],
  ];
  for (const [SMTP_PASS, credentialHint, expectedAction] of examples) {
    const result = await verifyEmailConnection({
      env: { ...env, SMTP_PASS }, createTransport() { calls++; throw new Error('Must not connect'); },
    });
    assert.equal(result.verified, false);
    assert.equal(result.reason, 'invalid_password_format');
    assert.equal(result.credentialHint, credentialHint);
    assert.match(result.error, expectedAction);
    assert.deepEqual(Object.keys(result).sort(), ['credentialHint', 'error', 'reason', 'verified']);
    assert.doesNotMatch(JSON.stringify(result), /abcdefghijklmn|passwordLength|credentialLength|hash/i);
    assert.ok(!JSON.stringify(result).includes(SMTP_PASS));
    assert.ok(!Object.hasOwn(emailStatus({ ...env, SMTP_PASS }), 'credentialHint'));
  }
  assert.equal(calls, 0);
  assert.deepEqual(logs, []);
});

test('single recipients are validated and reserved test domains never contact SMTP', async () => {
  let calls = 0;
  const transport = { async sendMail() { calls++; } };
  for (const to of ['a@inbox.com\r\nBcc: victim@inbox.com', 'a@inbox.com,b@inbox.com', 'Name <a@inbox.com>', ['a@inbox.com'], 'a..b@inbox.com', 'a@-bad.com', 'a@inbox.com ']) {
    assert.deepEqual(await sendNotification({ ...notification, to }, { env, transport }), { sent: false, reason: 'invalid_recipient' });
  }
  for (const to of ['a@seed.invalid', 'a@local.test', 'a@demo.example', 'a@x.localhost', 'a@example.com', 'a@sub.example.net', 'a@example.org']) {
    assert.deepEqual(await sendNotification({ ...notification, to }, { env, transport }), { sent: false, reason: 'test_recipient' });
  }
  assert.equal(calls, 0);
});

test('sending binds From to authenticated Gmail with strict TLS and closes owned transports', async () => {
  let smtp;
  let message;
  let closes = 0;
  const result = await sendNotification(notification, {
    env: { ...env, MAIL_FROM_NAME: 'Verbal\r\nNotifications', SMTP_HOST: 'evil.invalid', SMTP_PORT: '25', SMTP_TLS_REJECT_UNAUTHORIZED: 'false' },
    createTransport(options) {
      smtp = options;
      return { async sendMail(value) { message = value; return { accepted: [notification.to], rejected: [] }; }, close() { closes++; } };
    },
  });
  assert.deepEqual(result, { sent: true });
  assert.equal(smtp.host, 'smtp.gmail.com');
  assert.equal(smtp.port, 465);
  assert.equal(smtp.secure, true);
  assert.equal(smtp.pool, false);
  assert.equal(smtp.tls.rejectUnauthorized, true);
  assert.equal(smtp.tls.servername, 'smtp.gmail.com');
  assert.equal(smtp.connectionTimeout, 8_000);
  assert.equal(smtp.greetingTimeout, 8_000);
  assert.equal(smtp.socketTimeout, 12_000);
  assert.equal(smtp.logger, false);
  assert.equal(smtp.debug, false);
  assert.equal(smtp.transactionLog, false);
  assert.deepEqual(smtp.auth, { user: env.SMTP_USER, pass: 'abcdefghijklmnop' });
  assert.deepEqual(message.from, { name: 'Verbal  Notifications', address: env.SMTP_USER });
  assert.deepEqual(message.to, { address: notification.to });
  assert.ok(message.text.includes('Welcome to Verbal'));
  assert.ok(message.html.includes('https://verbal.app/#/dashboard'));
  assert.equal(closes, 1);
});

test('templates escape all personalized HTML and keep private messages out of email', () => {
  const hostile = '<img src=x onerror="alert(1)"> & \'hello\'';
  for (const type of ['welcome', 'booking_confirmed', 'booking_cancelled', 'lesson_completed', 'new_message']) {
    const content = buildEmail(type, {
      name: hostile, otherName: hostile, language: hostile, actorName: hostile,
      startsAt: '2026-11-20T15:00:00Z', price: 25, body: 'PRIVATE_MESSAGE_SECRET', password: 'PRIVATE_PASSWORD_SECRET',
    }, 'https://verbal.app/ignored?next=evil#/ignored');
    assert.match(content.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; &#39;hello&#39;/);
    assert.doesNotMatch(content.html, /<img|PRIVATE_MESSAGE_SECRET|PRIVATE_PASSWORD_SECRET/);
    assert.doesNotMatch(content.text, /PRIVATE_MESSAGE_SECRET|PRIVATE_PASSWORD_SECRET/);
    assert.doesNotMatch(content.subject, /[\r\n<>]/);
    assert.match(content.html, /https:\/\/verbal\.app\/#\/(dashboard|messages)/);
    assert.doesNotMatch(content.html, /ignored|next=evil/);
    assert.ok(content.text.length > 100);
    if (type.startsWith('booking_') || type === 'lesson_completed') {
      assert.match(content.text, /UTC/);
      assert.match(content.text, /50 minutes/);
      assert.match(content.text, /\$25\.00 USD · Pay later/);
    }
  }
  assert.throws(() => buildEmail('unknown', {}, env.APP_ORIGIN), /Unsupported/);
  assert.match(buildEmail('booking_confirmed', { role: 'tutor' }, env.APP_ORIGIN).text, /\/#\/teaching/);
  assert.match(buildEmail('new_message', { role: 'tutor' }, env.APP_ORIGIN).text, /\/#\/messages/);
});

test('templates use UTC without guessing a user time zone and reject unsafe links', () => {
  const content = buildEmail('booking_confirmed', { startsAt: '2026-11-20T10:00:00-05:00' }, env.APP_ORIGIN);
  assert.match(content.text, /3:00 PM UTC/);
  assert.doesNotMatch(content.text, /Eastern|Toronto/);
  assert.match(buildEmail('booking_confirmed', { startsAt: '2026-11-20T10:00:00' }, env.APP_ORIGIN).text, /See your workspace for the lesson time/);
  for (const origin of ['javascript:alert(1)', 'http://verbal.app', 'https://user:secret@verbal.app', 'https://verbal.app\r\nX: evil', 'http://localhost.evil.com', undefined]) {
    assert.throws(() => buildEmail('welcome', {}, origin));
  }
  assert.match(buildEmail('new_message', {}, 'http://localhost:5173').text, /http:\/\/localhost:5173\/#\/messages/);
});

test('delivery errors are contained and logs never expose SMTP error details', async t => {
  const logs = [];
  t.mock.method(console, 'warn', (...values) => logs.push(values));
  let closes = 0;
  const error = Object.assign(new Error(`secret ${env.SMTP_PASS} ${notification.to} message-body`), { code: 'EAUTH', response: 'private SMTP response' });
  const result = await sendNotification(notification, {
    env, createTransport() { return { async sendMail() { throw error; }, close() { closes++; } }; },
  });
  assert.deepEqual(result, { sent: false, reason: 'delivery_failed' });
  assert.equal(closes, 1);
  assert.deepEqual(logs, [['[mail] Notification delivery failed.', { code: 'EAUTH' }]]);
  assert.doesNotMatch(JSON.stringify(logs), /secret|abcd|inbox|message-body|private SMTP/);
  let attempts = 0;
  assert.deepEqual(await sendNotification(notification, { env: { ...env, APP_ORIGIN: 'http://localhost:5173' }, createTransport() { attempts++; } }), { sent: false, reason: 'delivery_failed' });
  assert.equal(attempts, 0);
});

test('verification can check authentication while disabled without sending an email', async () => {
  let verified = 0;
  let sent = 0;
  let closed = 0;
  const result = await verifyEmailConnection({
    env: { ...env, MAIL_ENABLED: 'false' },
    createTransport() { return { async verify() { verified++; }, async sendMail() { sent++; }, close() { closed++; } }; },
  });
  assert.deepEqual(result, { verified: true });
  assert.equal(verified, 1);
  assert.equal(sent, 0);
  assert.equal(closed, 1);
  assert.deepEqual(await verifyEmailConnection({ env: {}, createTransport() { throw new Error('Must not connect'); } }), {
    verified: false, reason: 'missing_credentials', error: 'Add a Gmail address and a 16-character Google app password in SMTP_USER and SMTP_PASS.',
  });
  assert.deepEqual(await verifyEmailConnection({ env, transport: { async verify() { throw Object.assign(new Error('private auth error'), { code: 'EAUTH' }); } } }), {
    verified: false, reason: 'authentication_failed', error: 'Gmail rejected this app password. Check SMTP_USER and SMTP_PASS.',
  });
  assert.deepEqual(await verifyEmailConnection({ env, transport: { async verify() { throw Object.assign(new Error('private auth error'), { code: 'secret-credential' }); } } }), {
    verified: false, reason: 'connection_failed', error: 'Could not verify the Gmail connection. Try again shortly.',
  });
});
