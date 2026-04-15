import { join } from 'path';

const distClientDir = join(import.meta.dir, 'dist', 'client');

const handler = await import('./dist/server/server.js').then(
  (m) => m.default.fetch,
);

Bun.serve({
  port: parseInt(process.env.PORT!) || 3000,
  async fetch(request) {
    const url = new URL(request.url);

    // Serve static files from dist/client
    if (url.pathname.startsWith('/assets/') || url.pathname === '/favicon.ico') {
      const filePath = join(distClientDir, url.pathname);
      const file = Bun.file(filePath);

      if (await file.exists()) {
        return new Response(file, {
          headers: {
            'Cache-Control': url.pathname.startsWith('/assets/')
              ? 'public, max-age=31536000, immutable'
              : 'public, max-age=3600',
          },
        });
      }
    }

    // Fallback to TanStack Start handler
    return handler(request);
  },
});

console.log(
  `Server running on http://localhost:${process.env.PORT || 3000}`,
);
