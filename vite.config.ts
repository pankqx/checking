import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { exclude: ['@mlc-ai/web-llm', '@huggingface/transformers'] },
})
