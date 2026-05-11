import { defineConfig } from 'vite';
import wgsl from 'vite-plugin-wgsl';

export default defineConfig({
  plugins: [wgsl({
    include: [/\.wgsl$/]
  })],
});