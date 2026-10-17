import path from 'node:path';
import { fileURLToPath } from 'node:url';

import basicAuth from 'express-basic-auth';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const password = process.env.APP_PASSWORD;

if (!password) {
  throw new Error(
    'APP_PASSWORD environment variable must be set before starting the server.',
  );
}

// Health check must be unauthenticated so Render can verify the service.
app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

app.use(
  basicAuth({
    users: { owner: password },
    challenge: true,
    realm: 'XQ Exercises',
  }),
);

const distDir = path.resolve(__dirname, 'dist');
app.use(express.static(distDir, { immutable: true, maxAge: '1y' }));

// SPA fallback: the bundle is a single-page app with no routing, but reloads
// on the root origin should still serve index.html.
app.use((_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'), {
    cacheControl: false,
  });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
