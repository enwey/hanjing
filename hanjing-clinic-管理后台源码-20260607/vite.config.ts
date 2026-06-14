import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    server: {
      port: parseInt(env.PORT || '3000', 10),
      strictPort: true,
      open: true
    },
    preview: {
      port: parseInt(env.PORT || '3000', 10),
      strictPort: true
    }
  }
})
