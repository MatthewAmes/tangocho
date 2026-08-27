/* Where the sign-in session lives. Split out on its own because the speech layer needs to read it and nothing else about the app — a module that imported the whole app back would be a cycle. clearSessionStorage stays with the auth store, which owns the cached email it also has to reset. */

export const SESSION_KEY = "jpn101:session";

export const USER_EMAIL_KEY = "jpn101:userEmail";

export function loadSession() {
  try { return window.localStorage.getItem(SESSION_KEY); } catch (e) { return null; }
}

export function saveSession(session, email) {
  try {
    window.localStorage.setItem(SESSION_KEY, session);
    if (email) window.localStorage.setItem(USER_EMAIL_KEY, email);
  } catch (e) {}
}
