/**
 * Service Worker for SAR Check-In/Out PWA
 *
 * Provides basic offline caching for the app shell and assets.
 */

const CACHE_NAME = 'sar-checkin-cache-v1'; // Increment version number to force update

// List of URLs to cache initially (App Shell)
const urlsToCache = [
  './', // Cache the root (index.html) - Use './' for relative path
  './manifest.json', // Cache the manifest
  // Add paths to your icons - IMPORTANT: Update these paths if they differ!
  './images/icon-192.png',
  './images/icon-512.png',
  // NOTE: Caching external CDN resources can be tricky due to CORS and updates.
  // The browser is usually good at caching these. Explicitly caching them
  // here might lead to using outdated versions if the CDN updates.
  // Consider removing CDN URLs from explicit caching if issues arise.
  // If you keep them, be aware they might fail to cache if the CDN response is opaque.
  // 'https://cdn.tailwindcss.com', // Example - potentially problematic
  // 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css', // Example
  // 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js', // Example
  // 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js', // Example
  // 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.2/papaparse.min.js', // Example
  // 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js' // Example
];

/**
 * Installation Event
 * - Opens the cache
 * - Adds the core app shell URLs to the cache.
 */
self.addEventListener('install', event => {
  console.log('[Service Worker] Install event');
  // Perform install steps
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Opened cache:', CACHE_NAME);
        // Add all URLs to cache. Use addAll for atomic operation.
        return cache.addAll(urlsToCache).catch(error => {
          console.error('[Service Worker] Failed to cache initial URLs:', error);
          // Decide if installation should fail if *any* core asset fails.
          // For core assets like './', './manifest.json', it probably should.
          // For external CDNs or non-critical images, maybe not.
          // Rethrowing the error will cause the install to fail.
          // throw error;
        });
      })
      .then(() => {
        console.log('[Service Worker] Core assets cached successfully.');
        // Force the waiting service worker to become the active service worker.
        // This ensures the latest SW takes control immediately after install.
        return self.skipWaiting();
      })
  );
});

/**
 * Activation Event
 * - Cleans up old caches.
 */
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activate event');
  const cacheWhitelist = [CACHE_NAME]; // Only keep the current cache version
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // If the cache name isn't in our whitelist, delete it
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Claiming clients.');
      // Take control of currently open clients (tabs/windows) immediately.
      return self.clients.claim();
    })
  );
});

/**
 * Fetch Event (Network Strategy: Cache First, then Network)
 * - Intercepts network requests.
 * - Checks if the request exists in the cache.
 * - If yes, serves from cache.
 * - If no, fetches from the network, serves it, and adds it to the cache.
 */
self.addEventListener('fetch', event => {
  // console.log('[Service Worker] Fetching:', event.request.url);

  // Use a Cache-First strategy for all GET requests.
  // For non-GET requests, or specific paths you don't want cached, bypass the cache.
  if (event.request.method !== 'GET') {
    // console.log('[Service Worker] Bypassing cache for non-GET request:', event.request.method, event.request.url);
    // Don't handle non-GET requests with the cache. Let them go to the network directly.
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Cache hit - return response
        if (cachedResponse) {
          // console.log('[Service Worker] Serving from cache:', event.request.url);
          return cachedResponse;
        }

        // Not in cache - fetch from network
        // console.log('[Service Worker] Not in cache, fetching from network:', event.request.url);
        return fetch(event.request).then(
          networkResponse => {
            // Check if we received a valid response
            // Basic check: OK status (200-299).
            // Opaque responses (type 'opaque') are from cross-origin requests without CORS.
            // We *can* cache them, but we *cannot* inspect their status or content.
            // Caching opaque responses can fill up storage quickly with potentially useless data.
            // It's generally safer to only cache responses we know are valid (status 200).
            if (!networkResponse || networkResponse.status !== 200 /*|| networkResponse.type !== 'basic'*/) {
               // Don't cache non-200 responses.
               // If networkResponse.type is 'opaque', you might decide to cache it anyway,
               // but be aware of the limitations.
               // console.log(`[Service Worker] Not caching invalid/opaque response for: ${event.request.url}, Status: ${networkResponse?.status}, Type: ${networkResponse?.type}`);
              return networkResponse;
            }

            // IMPORTANT: Clone the response. A response is a stream
            // and because we want the browser to consume the response
            // as well as the cache consuming the response, we need
            // to clone it so we have two streams.
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                // console.log('[Service Worker] Caching new resource:', event.request.url);
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          }
        ).catch(error => {
          console.error('[Service Worker] Fetch failed; returning offline fallback or error.', error);
          // Optional: Return a basic offline fallback page if fetch fails entirely
          // For example: return caches.match('/offline.html');
          // Or just let the browser handle the fetch error.
          // Returning nothing here will result in the browser's default network error page.
        });
      })
  );
});
