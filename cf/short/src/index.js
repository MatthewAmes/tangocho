/* A short address that forwards to the app.
 *
 * The app itself can't simply be renamed: a different hostname is a different origin, and
 * Google won't run the sign-in button on an origin that isn't listed on the OAuth client.
 * That list is console-only — no API — so a rename costs a manual step and, until it's
 * done, locks the deck out on the new address. This forwards instead, which needs nothing
 * and breaks nothing.
 *
 * 302, not 301: a permanent redirect gets cached by browsers more or less forever, so if
 * this hostname ever becomes the real app, old devices would keep bouncing off it.
 */
const TARGET = "https://tangocho.deskbuddies.workers.dev";

export default {
  fetch(request) {
    const url = new URL(request.url);
    return Response.redirect(TARGET + url.pathname + url.search + url.hash, 302);
  },
};
