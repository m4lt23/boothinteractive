import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// This configuration is designed to solve the Vercel/Netlify deployment issue
// caused by the project structure (monorepo with 'client' folder).
export default defineConfig({
  // 1. Set the root for Vite to the 'client' folder.
  // This tells Vite where to find index.html and source files.
  root: 'client',
  
  plugins: [react()],
  
  // 2. Configure the build output.
  build: {
    // outDir is set relative to the *repository root*
    // but the build runs inside 'client'. '../dist' tells it to jump up one
    // level to the repository root and save the compiled files in 'dist'.
    // This makes Netlify happy when its 'Publish directory' is set to 'dist'.
    outDir: '../dist',
  },
})
