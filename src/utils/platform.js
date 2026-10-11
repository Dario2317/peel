// Small checks about the device we're running on.

// iPadOS Safari pretends to be a Mac, so we also check for a touch screen.
export function isIOS() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isIPad() {
  const ua = navigator.userAgent;
  return /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// Adds classes like "is-ipad is-standalone" to <html>, so the CSS can adapt.
// Since iPadOS 26, Home Screen web apps get the system window controls in
// their top-left corner, so the toolbars leave that corner empty.
export function markPlatform() {
  const classes = document.documentElement.classList;
  classes.toggle('is-ipad', isIPad());
  classes.toggle('is-standalone', isStandalone());
}

// True when opened from the Home Screen (not in a normal browser tab).
export function isStandalone() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
