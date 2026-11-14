export const workspaceHome = user => user?.role === 'admin' ? 'admin' : user?.role === 'tutor' ? 'growth' : 'dashboard';

export function workspaceDestination(user, page) {
  if (!user) return page;
  if (user.role === 'admin' && !['admin', 'messages', 'settings', 'practice'].includes(page)) return 'admin';
  if (user.role === 'tutor' && !['growth', 'teaching', 'messages', 'settings', 'practice'].includes(page)) return 'growth';
  if (user.role === 'learner' && ['growth', 'admin'].includes(page)) return 'dashboard';
  return page;
}
