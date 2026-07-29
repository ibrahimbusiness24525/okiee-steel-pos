import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Web dev server ke liye config
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
