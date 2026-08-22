// Service worker mínimo — apenas para habilitar a instalação como app (PWA).
// Não faz cache agressivo: os dados do Cofre vêm sempre "ao vivo" do Supabase,
// então evitamos guardar respostas antigas que poderiam confundir o usuário.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
