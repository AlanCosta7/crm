import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3')) {
              return 'charts'; // Gráficos separados
            }
            if (id.includes('@dnd-kit')) {
              return 'dnd'; // Drag & drop separado
            }
            if (id.includes('firebase')) {
              return 'firebase'; // SDK do Firebase separado
            }
            if (id.includes('animejs')) {
              return 'animations'; // Biblioteca de animações separada
            }
            return 'vendor'; // Demais dependências comuns
          }
        }
      }
    }
  }
})
