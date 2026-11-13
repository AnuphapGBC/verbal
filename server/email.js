import nodemailer from 'nodemailer';
import { buildEmail } from './email-templates.js';

const knownErrorCodes = new Set(['EAUTH', 'ECONNECTION', 'ECONNREFUSED', 'ECONNRESET', 'EDNS', 'ENOTFOUND', 'ETIMEDOUT', 'ESOCKET', 'ETLS', 'EENVELOPE', 'EMESSAGE', 'ESTREAM']);

function singleAddress(value) {
  if (typeof value !== 'string' || value.length > 254 || /[\u0000-\u0020\u007f]/.test(value)) return null;
  const [local, domain, extra] = value.split('@');
  if (extra !== undefined || !local || local.length > 64 || !domain || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  if (!/^[a-z0-9._%+-]+$/i.test(local)) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(domain)) return null;
  if (domain.split('.').some(label => label.length > 63)) return null;
  return `${local}@${domain.toLowerCase()}`;
}

function configuration(env) {
  const candidate = singleAddress(env.SMTP_USER);
  const sender = candidate?.split('@')[1] === 'gmail.com' ? candidate : null;
  // Google displays app passwords in four groups. Ordinary account passwords
  // and values containing punctuation or line breaks never configure SMTP.
  const password = typeof env.SMTP_PASS === 'string' ? env.SMTP_PASS.replace(/ /g, '') : '';
  const validPassword = /^[A-Za-z0-9]{16}$/.test(password);
  const required = [];
  if (!sender) required.push('SMTP_USER');
  if (!validPassword) required.push('SMTP_PASS');
  return { sender, password: validPassword ? password : null, required, enabled: env.MAIL_ENABLED === 'true' };
}

/** Safe to expose in health/admin responses: no credentials are included. */
export function emailStatus(env = process.env) {
  const config = configuration(env);
  const configured = config.required.length === 0;
  return {
    provider: 'gmail', sender: config.sender, enabled: config.enabled, configured,
    status: !config.enabled ? 'disabled' : configured ? 'ready' : 'missing_credentials',
    required: config.required,
  };
}

function transportOptions(config) {
  return {
    host: 'smtp.gmail.com', port: 465, secure: true, pool: false,
    auth: { user: config.sender, pass: config.password },
    tls: { rejectUnauthorized: true, servername: 'smtp.gmail.com', minVersion: 'TLSv1.2' },
    connectionTimeout: 8_000, greetingTimeout: 8_000, socketTimeout: 12_000,
    logger: false, debug: false, transactionLog: false,
    disableFileAccess: true, disableUrlAccess: true,
  };
}

function isTestRecipient(address) {
  const domain = address.split('@')[1].toLowerCase();
  return ['invalid', 'example', 'test', 'localhost'].some(tld => domain === tld || domain.endsWith(`.${tld}`)) ||
    ['example.com', 'example.net', 'example.org'].some(reserved => domain === reserved || domain.endsWith(`.${reserved}`));
}

function safeCode(error) {
  return knownErrorCodes.has(error?.code) ? error.code : 'DELIVERY_FAILED';
}

function senderName(value) {
  return (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 100) : '') || 'Verbal Notifications';
}

function getTransport(config, options) {
  return options.transport || (options.createTransport || nodemailer.createTransport)(transportOptions(config));
}

function closeOwnedTransport(transport, options) {
  if (options.transport || !transport?.close) return;
  try { transport.close(); } catch { /* Closing must never change the application result. */ }
}

/** Verify SMTP authentication without sending an email, even while mail is off. */
export async function verifyEmailConnection(options = {}) {
  const config = configuration(options.env || process.env);
  if (config.required.length) return {
    verified: false, reason: 'missing_credentials',
    error: 'Add a Gmail address and a 16-character Google app password in SMTP_USER and SMTP_PASS.',
  };
  let transport;
  try {
    transport = getTransport(config, options);
    await transport.verify();
    return { verified: true };
  } catch (error) {
    return safeCode(error) === 'EAUTH'
      ? { verified: false, reason: 'authentication_failed', error: 'Gmail rejected this app password. Check SMTP_USER and SMTP_PASS.' }
      : { verified: false, reason: 'connection_failed', error: 'Could not verify the Gmail connection. Try again shortly.' };
  } finally {
    closeOwnedTransport(transport, options);
  }
}

/** Notification delivery is best-effort and never rejects a completed user action. */
export async function sendNotification({ to, type, data } = {}, options = {}) {
  const env = options.env || process.env;
  const config = configuration(env);
  if (!config.enabled) return { sent: false, reason: 'disabled' };
  if (config.required.length) return { sent: false, reason: 'missing_credentials' };
  const recipient = singleAddress(to);
  if (!recipient) return { sent: false, reason: 'invalid_recipient' };
  if (isTestRecipient(recipient)) return { sent: false, reason: 'test_recipient' };
  let transport;
  try {
    if (env.NODE_ENV === 'production' && !env.APP_ORIGIN?.startsWith('https://')) throw new Error('Invalid app origin');
    const content = buildEmail(type, data, env.APP_ORIGIN);
    transport = getTransport(config, options);
    const result = await transport.sendMail({
      from: { name: senderName(env.MAIL_FROM_NAME), address: config.sender },
      to: { address: recipient }, ...content,
      disableFileAccess: true, disableUrlAccess: true,
    });
    if (result?.rejected?.length) throw Object.assign(new Error('Recipient rejected'), { code: 'EENVELOPE' });
    return { sent: true };
  } catch (error) {
    // SMTP responses can contain credentials, recipients and message content.
    // Only a fixed allowlist of error codes may reach logs or API responses.
    console.warn('[mail] Notification delivery failed.', { code: safeCode(error) });
    return { sent: false, reason: 'delivery_failed' };
  } finally {
    closeOwnedTransport(transport, options);
  }
}
