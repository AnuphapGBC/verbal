const subjects = {
  welcome: 'Welcome to Verbal',
  booking_confirmed: 'Your Verbal lesson is confirmed',
  booking_cancelled: 'Your Verbal lesson was cancelled',
  lesson_completed: 'A little more progress on Verbal',
  new_message: 'You have a new message on Verbal',
};

function line(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200) || fallback;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function workspaceLink(origin, page) {
  if (typeof origin !== 'string' || /[\u0000-\u0020\u007f]/.test(origin)) throw new Error('Invalid app origin');
  const url = new URL(origin);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.username || url.password || !(url.protocol === 'https:' || (url.protocol === 'http:' && local))) {
    throw new Error('Invalid app origin');
  }
  return `${url.origin}/#/${page}`;
}

function lessonTime(value) {
  // Timestamps without a zone are ambiguous. All email times use UTC explicitly.
  const zoned = value instanceof Date || typeof value === 'number' ||
    (typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value));
  const date = zoned ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) return 'See your workspace for the lesson time';
  return `${new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC',
  }).format(date)} UTC`;
}

function lessonPrice(value) {
  const valid = typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d{1,2})?$/.test(value));
  const amount = valid ? Number(value) : NaN;
  return Number.isFinite(amount) && amount >= 0
    ? `${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)} USD · Pay later`
    : 'Pay later · See your lesson details';
}

/** Build a private, transactional email with an equivalent plain text version. */
export function buildEmail(type, data = {}, origin) {
  if (!Object.hasOwn(subjects, type)) throw new Error('Unsupported notification type');
  const name = line(data.name, 'there');
  const otherName = line(data.otherName, data.role === 'tutor' ? 'your learner' : 'your tutor');
  const language = line(data.language, 'language');
  const link = workspaceLink(origin, type === 'new_message' ? 'messages' : data.role === 'tutor' ? 'teaching' : 'dashboard');
  let heading;
  let paragraphs;
  let details = [];
  let action = 'Open my workspace';

  switch (type) {
    case 'welcome':
      heading = 'Good things start with hello.';
      paragraphs = [
        'Welcome to Verbal, a place to build confidence through real conversations.',
        'Find a tutor, reserve a 50-minute lesson, and make a little room for progress. Reservations are pay later; Verbal does not collect card details or process payments.',
      ];
      break;
    case 'booking_confirmed':
      heading = data.role === 'tutor' ? 'A new conversation is on your calendar.' : 'Your next conversation is booked.';
      paragraphs = [`Your ${language} lesson with ${otherName} is confirmed.`,
        'Pay later. Verbal has not charged you or collected a payment. Arrange payment directly with your tutor before the lesson.'];
      action = 'View my lesson';
      break;
    case 'booking_cancelled':
      heading = 'Your lesson plans have changed.';
      paragraphs = [`Your ${language} lesson with ${otherName} was cancelled.`,
        data.actorName ? `${line(data.actorName, 'A lesson participant')} cancelled this lesson.` : 'You can review your lesson details in your workspace.',
        'Verbal does not process payments. If you made a payment arrangement, contact your tutor about any changes.'];
      action = 'View my lessons';
      break;
    case 'lesson_completed':
      heading = 'A little more confidence, one conversation at a time.';
      paragraphs = [`Your ${language} lesson with ${otherName} has been marked complete.`,
        data.role === 'tutor' ? 'Thank you for helping your learner find their voice.' : 'Thank you for showing up for your progress. You can leave a review from your workspace.',
        'Your reservation was pay later. Verbal does not process payments; follow the arrangements you made with your tutor.'];
      action = 'View my lessons';
      break;
    case 'new_message':
      heading = 'There is a little hello waiting for you.';
      paragraphs = [`${line(data.otherName, 'Someone in your conversation')} sent you a message on Verbal.`,
        'Open your messages to read it and reply. Message contents stay in your Verbal workspace.'];
      action = 'Read my messages';
      break;
  }

  if (['booking_confirmed', 'booking_cancelled', 'lesson_completed'].includes(type)) {
    details = [['Lesson time', lessonTime(data.startsAt)], ['Duration', '50 minutes'], ['Reservation', lessonPrice(data.price)]];
  }

  const footer = 'You received this email because of activity on your Verbal account. Please open your workspace to manage lessons and messages.';
  const text = [
    'VERBAL', heading, `Hi ${name},`, ...paragraphs,
    ...details.map(([label, value]) => `${label}: ${value}`),
    `${action}: ${link}`, 'A little conversation. A world of possibility.', footer,
  ].join('\n\n');
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subjects[type])}</title></head>
<body style="margin:0;padding:24px 12px;background:#f6f4eb;color:#193b38;font-family:Arial,Helvetica,sans-serif;line-height:1.7;">
  <table role="presentation" style="width:100%;max-width:600px;margin:0 auto;border-collapse:collapse;">
    <tr><td style="padding:24px 28px;background:#ffffff;border:1px solid #d9e1d7;border-radius:12px;">
      <p style="margin:0 0 24px;color:#266b5c;font-size:25px;font-weight:700;letter-spacing:1px;">verbal<span style="color:#b3b765;">.</span></p>
      <h1 style="margin:0 0 24px;font-size:28px;line-height:1.25;color:#193b38;">${escapeHtml(heading)}</h1>
      <p style="margin:0 0 16px;">Hi ${escapeHtml(name)},</p>
      ${paragraphs.map(paragraph => `<p style="margin:0 0 16px;">${escapeHtml(paragraph)}</p>`).join('\n      ')}
      ${details.length ? `<table style="width:100%;margin:24px 0;border-collapse:collapse;text-align:left;">${details.map(([label, value]) => `<tr><th scope="row" style="padding:10px 12px;border-bottom:1px solid #d9e1d7;font-size:14px;vertical-align:top;">${escapeHtml(label)}</th><td style="padding:10px 12px;border-bottom:1px solid #d9e1d7;font-size:14px;">${escapeHtml(value)}</td></tr>`).join('')}</table>` : ''}
      <p style="margin:28px 0;"><a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 22px;border-radius:7px;background:#245b4e;color:#ffffff;text-decoration:none;font-weight:700;">${escapeHtml(action)}</a></p>
      <p style="margin:28px 0 0;color:#53645c;font-size:14px;">A little conversation. A world of possibility.</p>
    </td></tr>
    <tr><td style="padding:20px 28px;color:#53645c;font-size:12px;">${escapeHtml(footer)}</td></tr>
  </table>
</body>
</html>`;
  return { subject: subjects[type], text, html };
}
