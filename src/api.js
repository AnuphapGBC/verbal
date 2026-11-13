import avatar from './avatar.svg';
export const defaultAvatar = avatar;

export async function api(path, options = {}) {
  const { signal, ...rest } = options;
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...rest,
      credentials: 'same-origin',
      signal,
      headers: { ...(rest.body ? { 'Content-Type': 'application/json' } : {}), ...rest.headers },
      body: rest.body ? JSON.stringify(rest.body) : undefined,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Unable to reach Verbal. Check your connection and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fallback=response.status===404
      ? 'This service could not be found. Please refresh the page; if it continues, the site needs a deployment update.'
      : 'Something went wrong. Please try again.';
    const error = new Error(data.error || fallback);
    error.status = response.status;
    throw error;
  }
  return data;
}

export const dateTime = value => new Date(value).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
export const goals = ['Everyday conversation', 'Work and career', 'Travel and culture', 'Exams and study'];
export const languages = ['English', 'Spanish', 'French', 'German', 'Italian', 'Japanese'];

export function imageFallback(event) {
  event.currentTarget.onerror = null;
  event.currentTarget.src = avatar;
}
