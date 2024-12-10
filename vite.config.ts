import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import serveStatic from 'serve-static';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
        {
            name: 'serve-static-folder',
            configureServer(server) {
                // Serve a folder named "mock-folder" at `/mock`
                server.middlewares.use(
                    '/mock',
                    serveStatic(path.resolve(__dirname, '../auto_labelling'))
                );
            }
        }
    ],
});
