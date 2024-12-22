import express from 'express';
import path from 'path';
import serveStatic from 'serve-static';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

// Serve the Vite build output
app.use(serveStatic(path.join(__dirname, 'dist')));

// Serve the custom folder at `/mock`
app.use('/mock', serveStatic('/'));

// Fallback for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Mock data available at http://localhost:${PORT}/mock`);
});
