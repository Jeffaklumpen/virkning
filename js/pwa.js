/* Register the offline service worker without an inline script (compatible with strict CSP). */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', {scope: './'}).catch(() => {});
  });
}
