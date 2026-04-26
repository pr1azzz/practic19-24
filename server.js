const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
require('dotenv').config();

const {
    initRedis,
    cacheMiddleware,
    saveToCache,
    invalidateUsersCache,
    invalidateProductsCache
} = require('./middleware/cache');

const {
    authMiddleware,
    roleMiddleware,
    generateAccessToken,
    generateRefreshToken
} = require('./middleware/auth');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ========== ХРАНИЛИЩА ДАННЫХ (в памяти) ==========

let users = [];
let products = [
    {
        id: '1',
        name: 'Ноутбук Apple MacBook Air 13"',
        price: 89999,
        description: 'M2, 8GB RAM, 256GB SSD',
        stock: 10
    },
    {
        id: '2',
        name: 'Смартфон Samsung Galaxy S23',
        price: 64999,
        description: '8GB RAM, 256GB, Snapdragon 8 Gen 2',
        stock: 15
    },
    {
        id: '3',
        name: 'Наушники Sony WH-1000XM5',
        price: 29999,
        description: 'Беспроводные, шумоподавление',
        stock: 20
    }
];

let refreshTokens = new Set();

// ========== SWAGGER КОНФИГУРАЦИЯ ==========

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'API с кэшированием Redis',
            version: '1.0.0',
            description: `
                ## Практическая работа №21 - Кэширование с Redis
                
                ### 🚀 Особенности:
                - **JWT аутентификация** (Access + Refresh токены)
                - **RBAC роли**: admin, seller, user
                - **Redis кэширование** для GET запросов
                
                ### ⚡ Кэшируемые маршруты:
                | Маршрут | TTL | Очистка кэша |
                |---------|-----|--------------|
                | GET /api/users | 1 минута | PUT/DELETE users |
                | GET /api/users/:id | 1 минута | PUT/DELETE users |
                | GET /api/products | 10 минут | POST/PUT/DELETE products |
                | GET /api/products/:id | 10 минут | POST/PUT/DELETE products |
                
                ### 👤 Тестовые пользователи (пароль = username):
                - **admin** (role: admin) - полный доступ
                - **seller** (role: seller) - управление товарами
                - **user** (role: user) - только чтение
            `,
            contact: { name: 'Student' }
        },
        servers: [
            { url: `http://localhost:${PORT}`, description: 'Локальный сервер' }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            },
            schemas: {
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', example: '1' },
                        username: { type: 'string', example: 'admin' },
                        role: { type: 'string', enum: ['admin', 'seller', 'user'] },
                        blocked: { type: 'boolean', example: false }
                    }
                },
                Product: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', example: '1' },
                        name: { type: 'string', example: 'Ноутбук' },
                        price: { type: 'integer', example: 89999 },
                        description: { type: 'string' },
                        stock: { type: 'integer', example: 10 }
                    }
                },
                LoginRequest: {
                    type: 'object',
                    required: ['username', 'password'],
                    properties: {
                        username: { type: 'string', example: 'admin' },
                        password: { type: 'string', example: 'admin' }
                    }
                },
                AuthResponse: {
                    type: 'object',
                    properties: {
                        accessToken: { type: 'string' },
                        refreshToken: { type: 'string' }
                    }
                },
                CacheResponse: {
                    type: 'object',
                    properties: {
                        source: { type: 'string', enum: ['cache', 'server'] },
                        cachedAt: { type: 'string', format: 'date-time' },
                        data: { type: 'array' }
                    }
                }
            }
        },
        security: [{ bearerAuth: [] }]
    },
    apis: ['./server.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ========== ИНИЦИАЛИЗАЦИЯ ПОЛЬЗОВАТЕЛЕЙ ==========

const initUsers = async () => {
    const adminHash = await bcrypt.hash('admin', 10);
    const sellerHash = await bcrypt.hash('seller', 10);
    const userHash = await bcrypt.hash('user', 10);
    
    users = [
        { id: '1', username: 'admin', passwordHash: adminHash, role: 'admin', blocked: false },
        { id: '2', username: 'seller', passwordHash: sellerHash, role: 'seller', blocked: false },
        { id: '3', username: 'user', passwordHash: userHash, role: 'user', blocked: false }
    ];
    console.log('✅ Пользователи инициализированы (пароль = username)');
};

// ========== AUTH МАРШРУТЫ ==========

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Авторизация пользователя
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Успешный вход
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Неверные учетные данные
 */
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    const user = users.find(u => u.username === username);
    if (!user || user.blocked) {
        return res.status(401).json({ error: 'Неверные учетные данные' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
        return res.status(401).json({ error: 'Неверные учетные данные' });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    refreshTokens.add(refreshToken);

    res.json({ accessToken, refreshToken });
});

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     summary: Обновление access токена
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Новые токены
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 */
app.post('/api/auth/refresh', (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken || !refreshTokens.has(refreshToken)) {
        return res.status(401).json({ error: 'Недействительный refresh token' });
    }

    try {
        const payload = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
        const user = users.find(u => u.id === payload.sub);

        if (!user || user.blocked) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }

        refreshTokens.delete(refreshToken);
        const newAccessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);
        refreshTokens.add(newRefreshToken);

        res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
    } catch (err) {
        return res.status(401).json({ error: 'Недействительный refresh token' });
    }
});

// ========== USERS МАРШРУТЫ (с кэшированием) ==========

/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: Получить список всех пользователей
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     description: |
 *       ⚡ **Кэшируется в Redis на 60 секунд**
 *       - При первом запросе данные берутся из сервера и сохраняются в кэш
 *       - Повторные запросы в течение 60 секунд возвращаются из кэша
 *     responses:
 *       200:
 *         description: Список пользователей
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CacheResponse'
 *       401:
 *         description: Не авторизован
 *       403:
 *         description: Недостаточно прав (только admin)
 */
app.get(
    '/api/users',
    authMiddleware,
    roleMiddleware(['admin']),
    cacheMiddleware(() => 'users:all', parseInt(process.env.USERS_CACHE_TTL) || 60),
    async (req, res) => {
        const data = users.map(u => ({
            id: u.id,
            username: u.username,
            role: u.role,
            blocked: u.blocked
        }));

        await saveToCache(req.cacheKey, data, req.cacheTTL);

        res.json({
            source: 'server',
            data
        });
    }
);

/**
 * @openapi
 * /api/users/{id}:
 *   get:
 *     summary: Получить пользователя по ID
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     description: ⚡ **Кэшируется в Redis на 60 секунд**
 *     responses:
 *       200:
 *         description: Данные пользователя
 *       404:
 *         description: Пользователь не найден
 */
app.get(
    '/api/users/:id',
    authMiddleware,
    roleMiddleware(['admin']),
    cacheMiddleware((req) => `users:${req.params.id}`, parseInt(process.env.USERS_CACHE_TTL) || 60),
    async (req, res) => {
        const user = users.find(u => u.id === req.params.id);

        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const data = {
            id: user.id,
            username: user.username,
            role: user.role,
            blocked: user.blocked
        };

        await saveToCache(req.cacheKey, data, req.cacheTTL);

        res.json({
            source: 'server',
            data
        });
    }
);

/**
 * @openapi
 * /api/users/{id}:
 *   put:
 *     summary: Обновить пользователя
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username: { type: string }
 *               role: { type: string, enum: [admin, seller, user] }
 *               blocked: { type: boolean }
 *     description: 🗑️ **Очищает кэш пользователей при обновлении**
 *     responses:
 *       200:
 *         description: Пользователь обновлен
 */
app.put('/api/users/:id', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
    const { username, role, blocked } = req.body;
    const user = users.find(u => u.id === req.params.id);

    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }

    if (username !== undefined) user.username = username;
    if (role !== undefined) user.role = role;
    if (blocked !== undefined) user.blocked = blocked;

    await invalidateUsersCache(user.id);

    res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        blocked: user.blocked
    });
});

/**
 * @openapi
 * /api/users/{id}:
 *   delete:
 *     summary: Заблокировать пользователя
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     description: 🗑️ **Очищает кэш пользователей при блокировке**
 *     responses:
 *       200:
 *         description: Пользователь заблокирован
 */
app.delete('/api/users/:id', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
    const user = users.find(u => u.id === req.params.id);

    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }

    user.blocked = true;
    await invalidateUsersCache(user.id);

    res.json({ message: 'Пользователь заблокирован', id: user.id });
});

// ========== PRODUCTS МАРШРУТЫ (с кэшированием) ==========

/**
 * @openapi
 * /api/products:
 *   get:
 *     summary: Получить список всех товаров
 *     tags: [Products]
 *     security: [{ bearerAuth: [] }]
 *     description: |
 *       ⚡ **Кэшируется в Redis на 600 секунд (10 минут)**
 *       - Доступен для всех авторизованных пользователей
 *     responses:
 *       200:
 *         description: Список товаров
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CacheResponse'
 */
app.get(
    '/api/products',
    authMiddleware,
    roleMiddleware(['user', 'seller', 'admin']),
    cacheMiddleware(() => 'products:all', parseInt(process.env.PRODUCTS_CACHE_TTL) || 600),
    async (req, res) => {
        const data = products.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            description: p.description,
            stock: p.stock
        }));

        await saveToCache(req.cacheKey, data, req.cacheTTL);

        res.json({
            source: 'server',
            data
        });
    }
);

/**
 * @openapi
 * /api/products/{id}:
 *   get:
 *     summary: Получить товар по ID
 *     tags: [Products]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     description: ⚡ **Кэшируется в Redis на 600 секунд (10 минут)**
 *     responses:
 *       200:
 *         description: Данные товара
 *       404:
 *         description: Товар не найден
 */
app.get(
    '/api/products/:id',
    authMiddleware,
    roleMiddleware(['user', 'seller', 'admin']),
    cacheMiddleware((req) => `products:${req.params.id}`, parseInt(process.env.PRODUCTS_CACHE_TTL) || 600),
    async (req, res) => {
        const product = products.find(p => p.id === req.params.id);

        if (!product) {
            return res.status(404).json({ error: 'Товар не найден' });
        }

        const data = {
            id: product.id,
            name: product.name,
            price: product.price,
            description: product.description,
            stock: product.stock
        };

        await saveToCache(req.cacheKey, data, req.cacheTTL);

        res.json({
            source: 'server',
            data
        });
    }
);

/**
 * @openapi
 * /api/products:
 *   post:
 *     summary: Создать новый товар
 *     tags: [Products]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, price]
 *             properties:
 *               name: { type: string, example: "Новый товар" }
 *               price: { type: integer, example: 1000 }
 *               description: { type: string }
 *               stock: { type: integer, example: 5 }
 *     description: 🗑️ **Очищает кэш товаров при создании**
 *     responses:
 *       201:
 *         description: Товар создан
 */
app.post('/api/products', authMiddleware, roleMiddleware(['seller', 'admin']), async (req, res) => {
    const { name, price, description, stock } = req.body;

    if (!name || !price) {
        return res.status(400).json({ error: 'name и price обязательны' });
    }

    const product = {
        id: String(products.length + 1),
        name,
        price,
        description: description || '',
        stock: stock || 0
    };

    products.push(product);
    await invalidateProductsCache();

    res.status(201).json(product);
});

/**
 * @openapi
 * /api/products/{id}:
 *   put:
 *     summary: Обновить товар
 *     tags: [Products]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               price: { type: integer }
 *               description: { type: string }
 *               stock: { type: integer }
 *     description: 🗑️ **Очищает кэш товаров при обновлении**
 *     responses:
 *       200:
 *         description: Товар обновлен
 *       404:
 *         description: Товар не найден
 */
app.put('/api/products/:id', authMiddleware, roleMiddleware(['seller', 'admin']), async (req, res) => {
    const { name, price, description, stock } = req.body;
    const product = products.find(p => p.id === req.params.id);

    if (!product) {
        return res.status(404).json({ error: 'Товар не найден' });
    }

    if (name !== undefined) product.name = name;
    if (price !== undefined) product.price = price;
    if (description !== undefined) product.description = description;
    if (stock !== undefined) product.stock = stock;

    await invalidateProductsCache(product.id);

    res.json(product);
});

/**
 * @openapi
 * /api/products/{id}:
 *   delete:
 *     summary: Удалить товар
 *     tags: [Products]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     description: 🗑️ **Очищает кэш товаров при удалении**
 *     responses:
 *       200:
 *         description: Товар удален
 *       404:
 *         description: Товар не найден
 */
app.delete('/api/products/:id', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
    const index = products.findIndex(p => p.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({ error: 'Товар не найден' });
    }

    const deleted = products[index];
    products.splice(index, 1);
    await invalidateProductsCache(req.params.id);

    res.json({ message: 'Товар удален', product: deleted });
});

// ========== ЗАПУСК ==========

const startServer = async () => {
    await initUsers();
    await initRedis();
    
    app.listen(PORT, () => {
        console.log(`
    ╔══════════════════════════════════════════════════════════════╗
    ║     🚀 ПРАКТИЧЕСКАЯ РАБОТА №21 - Redis кэширование         ║
    ╚══════════════════════════════════════════════════════════════╝
    
    📍 Swagger UI: http://localhost:${PORT}/api-docs
    
    ⚡ Кэшируемые маршруты:
       GET /api/users        → кэш 1 минута
       GET /api/users/:id    → кэш 1 минута
       GET /api/products     → кэш 10 минут
       GET /api/products/:id → кэш 10 минут
    
    🗑️ Очистка кэша при изменении данных:
       PUT/DELETE /api/users/*     → очищает кэш пользователей
       POST/PUT/DELETE /api/products/* → очищает кэш товаров
    
    👤 Тестовые пользователи (пароль = username):
       admin   (role: admin)  → полный доступ
       seller  (role: seller) → управление товарами
       user    (role: user)   → только чтение
        `);
    });
};

startServer();