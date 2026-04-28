const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;
const SERVER_ID = process.env.SERVER_ID || 'backend_unknown';

app.get('/', (req, res) => {
    res.json({
        message: 'Ответ от backend сервера',
        server: SERVER_ID,
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        server: SERVER_ID,
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ ${SERVER_ID} запущен на порту ${PORT}`);
});