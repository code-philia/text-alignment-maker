import express from 'express';
import path from 'path';
import serveStatic from 'serve-static';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3002;

// Serve the Vite build output
app.use(serveStatic(path.join(__dirname, 'dist')));

// Serve the custom folder at `/mock`
app.use('/mock', serveStatic('/'));

// Fallback for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// const corsOptions = {
//     origin: ['http://localhost:8080'],
//     methods: ['POST'],
//     credentials: true,
//     maxAge: 86400
// };

// // CORS 中间件仅应用于 API 路由
// app.post('/api/modify-file',
//     cors(corsOptions), // 应用 CORS 配置
//     express.json(),
//     (req, res) => {
//         const { filePath, content } = req.body
    
//         const fullPath = path.join('./public', filePath)
//         if (!fullPath.startsWith(path.resolve('./public'))) {
//             return res.status(403).json({ error: '非法的文件路径' })
//         }

//         try {
//             fs.writeFileSync(fullPath, content)
//             res.json({ success: true })
//         } catch (err) {
//             res.status(500).json({ error: err.message })
//         }
//     });
  

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Mock data available at http://localhost:${PORT}/mock`);
});
