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
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('tdesign-vue-next')) {
                return 'tdesign';
              }
              if (id.includes('echarts') || id.includes('zrender')) {
                return 'echarts';
              }
              return 'vendor';
            }
          }
        }
      },
      chunkSizeWarningLimit: 1000
    },
    server: {
      port: parseInt(env.PORT || '3000', 10),
      strictPort: true,
      open: true,
      proxy: {
        '/api': {
          target: env.VITE_BACKEND_PROXY_TARGET || 'http://localhost:5005',
          changeOrigin: true
        },
        '/uploads': {
          target: env.VITE_BACKEND_PROXY_TARGET || 'http://localhost:5005',
          changeOrigin: true
        }
      }
    },
    preview: {
      port: parseInt(env.PORT || '3000', 10),
      strictPort: true
    }
  }
})
