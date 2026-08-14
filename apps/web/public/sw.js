/* global self, clients, URL */

// Minimal Web Push service worker. Payloads are always generic (see
// apps/server/src/push/ and docs/ARCHITECTURE.md) - this file never sees,
// and could never display, actual message content or ciphertext.

self.addEventListener("push", (event) => {
  let data = { title: "Anonchat", body: "You have a new notification.", url: "/", tag: "anonchat" };
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      // Ignore an unparseable payload - fall back to the generic default above.
    }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Anonchat", {
      body: data.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: data.tag || "anonchat",
      renotify: false,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url || "/";
  const url = new URL(path, self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clientsArr) => {
      for (const client of clientsArr) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          if ("navigate" in client && client.url !== url) await client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});
