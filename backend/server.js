const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { pool, initPostgres } = require('./databases/postgres');
const { initRedis, cacheMiddleware, saveToCache, invalidateUsersCache, invalidateProductsCache } = require('./middleware/cache');
const { authMiddleware, roleMiddleware, generateAccessToken } = require('./middleware/auth');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SERVER_ID = process.env.SERVER_ID || `backend_${PORT}`;

console.log(`🚀 Запуск ${SERVER_ID} на порту ${PORT}`);

// ========== AUTH ==========

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    
    if (!user || user.blocked) {
        return res.status(401).json({ error: 'Неверные учетные данные' });
    }
    
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
        return res.status(401).json({ error: 'Неверные учетные данные' });
    }
    
    const accessToken = generateAccessToken(user);
    res.json({ accessToken, server: SERVER_ID });
});

// ========== USERS ==========

app.get('/api/users', authMiddleware, roleMiddleware(['admin']), 
    cacheMiddleware(() => 'users:all', parseInt(process.env.USERS_CACHE_TTL) || 60),
    async (req, res) => {
        const result = await pool.query('SELECT id, username, role, blocked FROM users ORDER BY id');
        await saveToCache(req.cacheKey, result.rows, req.cacheTTL);
        res.json({ source: 'server', from_server: SERVER_ID, data: result.rows });
    }
);

// ========== PRODUCTS ==========

app.get('/api/products', authMiddleware, roleMiddleware(['user', 'seller', 'admin']),
    cacheMiddleware(() => 'products:all', parseInt(process.env.PRODUCTS_CACHE_TTL) || 600),
    async (req, res) => {
        const result = await pool.query('SELECT * FROM products ORDER BY id');
        await saveToCache(req.cacheKey, result.rows, req.cacheTTL);
        res.json({ source: 'server', from_server: SERVER_ID, data: result.rows });
    }
);

app.post('/api/products', authMiddleware, roleMiddleware(['seller', 'admin']), async (req, res) => {
    const { name, price, description, stock } = req.body;
    const result = await pool.query(
        'INSERT INTO products (name, price, description, stock) VALUES ($1, $2, $3, $4) RETURNING *',
        [name, price, description || '', stock || 0]
    );
    await invalidateProductsCache();
    res.json({ from_server: SERVER_ID, product: result.rows[0] });
});

// Health check для балансировщика
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', server: SERVER_ID, timestamp: new Date().toISOString() });
});

// Корневой маршрут для тестирования балансировки
app.get('/', (req, res) => {
    res.json({
        message: 'Ответ от backend сервера',
        server: SERVER_ID,
        timestamp: new Date().toISOString()
    });
});

// ========== ЗАПУСК ==========

const startServer = async () => {
    await initPostgres();
    await initRedis();
    
// В конце файла должно быть:
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

startServer();