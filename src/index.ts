import { Hono } from 'hono';
import { admin } from './admin/pages';
import { api } from './api';
import { requireAuth } from './auth';
import type { Env } from './env';
import { handleRedirect, notFound } from './redirect';

const app = new Hono<{ Bindings: Env }>();

app.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /\n'));
app.get('/favicon.ico', (c) => c.body(null, 204));
app.get('/', (c) => c.redirect('/admin', 302));

// Auth gates everything under /admin (login page excepted inside) and /api.
app.use('/admin', requireAuth);
app.use('/admin/*', requireAuth);
app.use('/api/*', requireAuth);
app.route('/admin', admin);
app.route('/api', api);

// The short-link route matches last so it can never shadow the routes above.
app.get('/:slug', handleRedirect);
app.notFound(notFound);

export default app;
