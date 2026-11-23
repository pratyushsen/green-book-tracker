/*
 * Minimal service worker for Green Book Tracker.
 * It is used ONLY to display notifications triggered by the open app
 * (registration.showNotification works on more platforms than `new Notification`)
 * and to focus the app when a notification is clicked.
 *
 * It does NOT implement Web Push: no push subscription, no 'push' event handler,
 * so nothing is delivered while every tab of the app is closed.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
