import { defineConfig } from 'vite'

export default defineConfig({
  base: '/cyber-relic-scanner/',
  resolve: {
    alias: {
      '/pretext.js': '/node_modules/@chenglou/pretext/dist/layout.js',
    },
  },
})
