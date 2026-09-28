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
            // Pilha de markdown das notas do card — carregada sob demanda
            // junto com a aba Notas (NotesTab é lazy no DealSidebar); sem esta
            // regra ela cairia no 'vendor' e viria no carregamento inicial.
            if (
              /node_modules\/(react-markdown|remark|rehype|unified|mdast|hast|micromark|vfile|unist|property-information|space-separated-tokens|comma-separated-tokens|character-entities|decode-named-character-reference|html-url-attributes|zwitch|longest-streak|ccount|markdown-table|trim-lines|bail|is-plain-obj|trough|devlop|estree|style-to-js|style-to-object|inline-style-parser)/.test(id)
            ) {
              return 'markdown';
            }
            return 'vendor'; // Demais dependências comuns
          }
        }
      }
    }
  }
})
