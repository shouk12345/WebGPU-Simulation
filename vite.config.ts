import { defineConfig } from 'vite';
import wgsl from 'vite-plugin-wgsl';

export default defineConfig({
  base:'/WebGPU-Simulation/',
  plugins: [wgsl({
    include: [/\.wgsl$/]
  })],
});