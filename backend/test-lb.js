const express = require('express');

// Запускаем 3 сервера на разных портах
const servers = [
    { port: 3001, name: 'backend_1 (основной)' },
    { port: 3002, name: 'backend_2 (основной)' },
    { port: 3003, name: 'backend_3 (резервный)' }
];

servers.forEach(server => {
    const app = express();
    
    // Корневой маршрут
    app.get('/', (req, res) => {
        res.json({
            message: 'Ответ от backend сервера',
            server: server.name,
            port: server.port,
            time: new Date().toISOString()
        });
    });
    
    // Health check для балансировщика
    app.get('/health', (req, res) => {
        res.json({ 
            status: 'healthy', 
            server: server.name,
            port: server.port
        });
    });
    
    app.listen(server.port, () => {
        console.log(`✅ ${server.name} запущен на порту ${server.port}`);
    });
});

console.log('\n🚀 Запущено 3 backend сервера:');
console.log('   http://localhost:3001');
console.log('   http://localhost:3002');
console.log('   http://localhost:3003');
console.log('\n📋 Для теста откройте в браузере:');
console.log('   http://localhost:3001');
console.log('   http://localhost:3002');
console.log('   http://localhost:3003');