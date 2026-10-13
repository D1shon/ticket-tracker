import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BUILD_TIME = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      // version.json рядом с бандлом: клиент сверяет его со своей сборкой
      // и сам перезагружается на новую версию (см. авто-обновление в main.jsx)
      name: 'emit-version',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_TIME }) });
      },
    },
  ],
  define: {
    // Метка сборки — видна в Настройках; по ней различаем устройства со старым бандлом
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
})
