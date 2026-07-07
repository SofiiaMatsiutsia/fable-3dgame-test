import { defineConfig } from 'vite';

// Served from https://<user>.github.io/fable-3dgame-test/ on GitHub Pages,
// so assets must resolve under that subpath. Overridable via BASE_PATH for
// custom domains or local root serving.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/fable-3dgame-test/',
});
