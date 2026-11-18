// Guardian notifications. Served from /g/ so its default scope is /g/ only: the
// campaign and products pages are never controlled by this worker.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    console.error("[sw] unreadable push payload", e);
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "INNAYA", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data && event.notification.data.url;
  const url = new URL(typeof path === "string" && path.startsWith("/g/") ? path : "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((open) => {
      const same = open.find((c) => c.url === url);
      return same ? same.focus() : self.clients.openWindow(url);
    }),
  );
});
