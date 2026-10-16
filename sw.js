// Service worker del taller: la app se abre y funciona aunque no haya internet.
// - Al instalarse guarda la app entera (la lista ARCHIVOS la rellena el build con todos los archivos publicados),
//   también las partes que se cargan solo al usarlas (lector de códigos, lector de PDF).
// - La página se pide primero a la red, para ver los cambios al momento; si no hay red o tarda más de 3 s,
//   se abre la copia guardada.
// - Los archivos con huella en el nombre (assets/…-abc123.js) no cambian nunca: se sirven de la copia.
// - Fuentes y el lector de texto de las fotos (de internet) se guardan aparte la primera vez que se usan.
const VERSION = 'mvb990a1'
const ARCHIVOS = ["apple-touch-icon.png","assets/browser-9N13tL9z.js","assets/catalogo-BbpUiNGB.js","assets/index-6KWpTIum.js","assets/index-Cw7HLg14.css","assets/pdf-DV-npZbQ.js","assets/pdf.worker.min-CjEcRF4W.mjs","assets/pdf.worker.min-DI4FfYVf.js","assets/ponyfill-BwU-J-8L.js","assets/rolldown-runtime-C0FnF6B9.js","assets/src-SuYvKHvm.js","assets/zxing_reader-BxB2YfIY.wasm","assets/zxing_reader-Wtw9a0oR.js","catalogos/velimsa-2025.csv","icon-192.png","icon-512.png","icon-maskable-512.png","icon.svg","manifest.webmanifest"]
const APP = 'taller-app-' + VERSION
const EXTERNOS = 'taller-externos'
const ESPERA_RED = 3000

const scope = self.registration.scope

self.addEventListener('install', (e) =>
  e.waitUntil(
    caches
      .open(APP)
      // La copia anterior ya tiene la mayoría: solo se descarga lo que falta
      .then(async (c) => {
        await c.add(scope)
        for (const a of ARCHIVOS) {
          const url = new URL(a, scope).href
          if (await caches.match(url)) await c.put(url, (await caches.match(url)).clone())
          else await c.add(url).catch(() => {})
        }
      })
      .then(() => self.skipWaiting()),
  ),
)

self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      // Se conserva la versión anterior por si alguna pantalla abierta todavía la usa; las más viejas se borran
      .then((ks) => {
        const viejas = ks.filter((k) => k.startsWith('taller-') && k !== APP && k !== EXTERNOS).sort()
        return Promise.all(viejas.slice(0, -1).map((k) => caches.delete(k)))
      })
      .then(() => self.clients.claim()),
  ),
)

const guardar = (cache, req, res) => {
  if (res.ok) caches.open(cache).then((c) => c.put(req, res.clone()))
  return res
}

// La red, pero sin esperar más de 3 s si hay copia; sin red, la copia al momento
function redOCopia(req, cache, alternativa) {
  const copia = async () => (await caches.match(req, { ignoreSearch: true })) ?? (await alternativa?.())
  return new Promise((responder) => {
    let hecho = false
    const fin = (r) => {
      if (!hecho && r) (hecho = true), responder(r)
    }
    fetch(req)
      .then((res) => fin(guardar(cache, req, res)))
      .catch(async () => fin((await copia()) ?? Response.error()))
    setTimeout(async () => fin(await copia()), ESPERA_RED)
  })
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  const propio = url.origin === self.location.origin
  const externo = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'fastly.jsdelivr.net'].includes(url.host)
  if (!propio && !externo) return // Supabase y demás: siempre a la red

  if (req.mode === 'navigate') return e.respondWith(redOCopia(req, APP, () => caches.match(scope)))
  if (propio && url.pathname.includes('/assets/'))
    return e.respondWith(caches.match(req).then((r) => r ?? fetch(req).then((res) => guardar(APP, req, res))))
  if (externo) return e.respondWith(caches.match(req).then((r) => r ?? fetch(req).then((res) => guardar(EXTERNOS, req, res))))
  e.respondWith(redOCopia(req, APP))
})
