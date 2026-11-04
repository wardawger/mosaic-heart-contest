import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Each team heart lives at /h/<link-name>. Netlify rewrites that to heart.html
// (see netlify.toml); this does the same for `vite` and `vite preview`.
const heartRoutes = {
  name: 'heart-routes',
  configureServer(server) { server.middlewares.use(rewrite); },
  configurePreviewServer(server) { server.middlewares.use(rewrite); },
};
function rewrite(req, _res, next) {
  if (/^\/h\/[^/?]+\/?(\?.*)?$/.test(req.url)) req.url = '/heart.html';
  else if (/^\/admin\/?(\?.*)?$/.test(req.url)) req.url = req.url.replace(/^\/admin\/?/, '/admin.html');
  next();
}

export default defineConfig({
  plugins: [heartRoutes],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        heart: resolve(__dirname, 'heart.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
});
