// Lightweight auth cookie presence check
export function hasAuthCookie() {
  if (typeof document === 'undefined') return false;
  const c = document.cookie || '';
  // adjust list if your cookie names differ
  const names = ['moji_jwt', 'auth_token', 'token', 'sid'];
  return names.some((n) => new RegExp(`(?:^|;\\s*)${n}=`).test(c));
}
