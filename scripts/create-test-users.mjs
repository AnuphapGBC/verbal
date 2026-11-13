import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool, transaction } from '../server/db.js';
import { hashPassword, verifyPassword } from '../server/security.js';

const credentialUrl = new URL('../.env.test-accounts.json', import.meta.url);
const credentialPath = fileURLToPath(credentialUrl);
const definitions = [
  { email: 'admin@test.verbal.invalid', role: 'admin', name: 'Test Admin', goal: 'Test marketplace administration' },
  { email: 'tutor.english@test.verbal.invalid', role: 'tutor', name: 'Test Tutor — English', goal: 'Test English teaching and learner conversations' },
  { email: 'tutor.spanish@test.verbal.invalid', role: 'tutor', name: 'Test Tutor — Spanish', goal: 'Test Spanish teaching and learner conversations' },
  { email: 'student.one@test.verbal.invalid', role: 'learner', name: 'Test Student One', goal: 'Practice English conversation' },
  { email: 'student.two@test.verbal.invalid', role: 'learner', name: 'Test Student Two', goal: 'Practice Spanish conversation' },
];
const profiles = [
  { email: 'tutor.english@test.verbal.invalid', country: 'Canada', flag: '🇨🇦', language: 'English', native: 'English (Native), French (B2)', price: 20, tag: 'Test profile — English conversation practice', bio: 'This is a test tutor account for trying Verbal. Practice booking, scheduling, cancellation, and private messages here. This synthetic profile does not represent a real tutor or offer real lessons.', hours: [14, 18] },
  { email: 'tutor.spanish@test.verbal.invalid', country: 'Spain', flag: '🇪🇸', language: 'Spanish', native: 'Spanish (Native), English (C1)', price: 22, tag: 'Test profile — Spanish conversation practice', bio: 'This is a test tutor account for exploring Verbal in Spanish. Use it to test learner messages, lesson reservations, and availability. This synthetic profile does not represent a real tutor or offer real lessons.', hours: [16, 20] },
];

function seedError(code, message) { return Object.assign(new Error(message), { code, safeMessage: message }); }
function validateCredentials(saved) {
  if (!saved || !Number.isFinite(Date.parse(saved.createdAt)) || !Array.isArray(saved.accounts) || saved.accounts.length !== definitions.length) {
    throw seedError('INVALID_CREDENTIAL_FILE', 'The existing test credential file has an invalid format. It was not changed.');
  }
  const seen = new Set();
  for (const account of saved.accounts) {
    const definition = definitions.find(item => item.email === account.email);
    if (!definition || seen.has(account.email) || account.role !== definition.role || account.name !== definition.name
      || typeof account.password !== 'string' || account.password.length < 20 || account.password.length > 128
      || typeof account.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(account.id)) {
      throw seedError('INVALID_CREDENTIAL_FILE', 'The existing test credential file does not match the five expected fixtures. It was not changed.');
    }
    seen.add(account.email);
  }
  return saved;
}

async function loadCredentials() {
  try { return validateCredentials(JSON.parse(await readFile(credentialUrl, 'utf8'))); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error.safeMessage) throw error;
    throw seedError('INVALID_CREDENTIAL_FILE', 'The existing test credential file could not be read safely. It was not changed.');
  }
}

try {
  const result = await transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('verbal-test-user-seed'))");
    await client.query('SELECT pg_advisory_xact_lock(7421104)');
    const existing = await client.query('SELECT id,email,role,is_test,password_hash FROM verbal.users WHERE email=ANY($1::text[]) FOR UPDATE', [definitions.map(item => item.email)]);
    for (const row of existing.rows) {
      if (!row.is_test) throw seedError('EMAIL_ALREADY_IN_USE', 'An expected test email belongs to a non-test account. No accounts were changed.');
    }
    let credentials = await loadCredentials();
    if (!credentials) {
      if (existing.rowCount) throw seedError('MISSING_CREDENTIAL_FILE', 'Test accounts already exist but their local credential file is missing. Existing passwords were not reset.');
      credentials = { createdAt: new Date().toISOString(), accounts: definitions.map(({ email, role, name }) => ({ email, role, name, id: randomUUID(), password: randomBytes(24).toString('base64url') })) };
      // Persist passwords before the transaction commits so a later error or crash
      // can be retried without resetting an account. Never replace an existing file.
      await writeFile(credentialUrl, `${JSON.stringify(credentials, null, 2)}\n`, { flag: 'wx', mode: 0o600, flush: true });
    }
    const byEmail = new Map(existing.rows.map(row => [row.email, row]));
    for (const account of credentials.accounts) {
      const row = byEmail.get(account.email);
      if (!row) continue;
      if (row.id !== account.id || row.role !== account.role) {
        throw seedError('FIXTURE_MISMATCH', 'An existing test account does not match its saved fixture identity or role. It was not modified.');
      }
      if (!await verifyPassword(account.password, row.password_hash)) {
        throw seedError('TEST_PASSWORD_CHANGED', 'A test account password has changed. This script will not reset it or overwrite saved credentials.');
      }
    }

    let usersCreated = 0;
    for (const account of credentials.accounts) {
      if (byEmail.has(account.email)) continue;
      const definition = definitions.find(item => item.email === account.email);
      const passwordHash = await hashPassword(account.password);
      await client.query(`INSERT INTO verbal.users(id,name,email,password_hash,goal,role,is_test)
        VALUES($1,$2,$3,$4,$5,$6,true)`, [account.id, account.name, account.email, passwordHash, definition.goal, account.role]);
      usersCreated += 1;
    }

    let tutorProfilesCreated = 0;
    let availabilityAdded = 0;
    for (const profile of profiles) {
      const account = credentials.accounts.find(item => item.email === profile.email);
      const found = await client.query('SELECT id FROM verbal.tutors WHERE user_id=$1', [account.id]);
      let tutorId = found.rows[0]?.id;
      if (!tutorId) {
        const inserted = await client.query(`INSERT INTO verbal.tutors(user_id,name,country,flag,language,native,price,tag,bio,image,is_demo)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'',false) RETURNING id`, [account.id, account.name, profile.country, profile.flag, profile.language, profile.native, profile.price, profile.tag, profile.bio]);
        tutorId = inserted.rows[0].id;
        tutorProfilesCreated += 1;
      }
      // These clearly labelled test tutors support real account flows. Availability
      // is deliberately staggered so a learner can try both without overlap.
      const slots = await client.query(`WITH candidates AS (
        SELECT (day + hour_offset * interval '1 hour') AT TIME ZONE 'UTC' AS starts_at,
          ((day + hour_offset * interval '1 hour') AT TIME ZONE 'UTC') + interval '50 minutes' AS ends_at
        FROM generate_series(date_trunc('day',NOW() AT TIME ZONE 'UTC')+interval '1 day',
          date_trunc('day',NOW() AT TIME ZONE 'UTC')+interval '14 days',interval '1 day') AS days(day)
        CROSS JOIN unnest($2::int[]) AS hours(hour_offset)
      ) INSERT INTO verbal.availability(tutor_id,starts_at,ends_at)
        SELECT $1,c.starts_at,c.ends_at FROM candidates c
        WHERE NOT EXISTS(SELECT 1 FROM verbal.availability a WHERE a.tutor_id=$1 AND a.starts_at<c.ends_at AND a.ends_at>c.starts_at)
        AND NOT EXISTS(SELECT 1 FROM verbal.bookings b JOIN verbal.availability a ON a.id=b.slot_id
          WHERE b.user_id=$3 AND b.status='confirmed' AND a.starts_at<c.ends_at AND a.ends_at>c.starts_at)
        ON CONFLICT(tutor_id,starts_at) DO NOTHING`, [tutorId, profile.hours, account.id]);
      availabilityAdded += slots.rowCount;
    }
    return {
      usersCreated, tutorProfilesCreated, availabilityAdded,
      credentialsFile: credentialPath,
      accounts: credentials.accounts.map(({ id, email, role, name }) => ({ id, email, role, name })),
    };
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Test account setup failed.', { code: error.code || 'TEST_ACCOUNT_SETUP_ERROR', ...(error.safeMessage ? { reason: error.safeMessage } : {}) });
  process.exitCode = 1;
} finally {
  await pool.end();
}
