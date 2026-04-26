const { createClient } = require('redis');

let redisClient = null;

// Инициализация Redis клиента
const initRedis = async () => {
    redisClient = createClient({
        socket: {
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379
        }
    });

    redisClient.on('error', (err) => {
        console.log('❌ Redis ошибка:', err.message);
    });

    redisClient.on('connect', () => {
        console.log('✅ Redis подключен');
    });

    await redisClient.connect();
    return redisClient;
};

// Middleware для чтения из кэша
const cacheMiddleware = (keyBuilder, ttl) => {
    return async (req, res, next) => {
        try {
            if (!redisClient) {
                return next();
            }
            
            const key = keyBuilder(req);
            const cachedData = await redisClient.get(key);
            
            if (cachedData) {
                console.log(`📦 Cache HIT: ${key}`);
                return res.json({
                    source: 'cache',
                    data: JSON.parse(cachedData),
                    cachedAt: new Date().toISOString()
                });
            }
            
            console.log(`💾 Cache MISS: ${key}`);
            req.cacheKey = key;
            req.cacheTTL = ttl;
            next();
        } catch (err) {
            console.error('Cache read error:', err);
            next();
        }
    };
};

// Сохранение данных в кэш
const saveToCache = async (key, data, ttl) => {
    try {
        if (redisClient) {
            await redisClient.set(key, JSON.stringify(data), { EX: ttl });
            console.log(`💾 Cache SAVED: ${key} (TTL: ${ttl}s)`);
        }
    } catch (err) {
        console.error('Cache save error:', err);
    }
};

// Очистка кэша пользователей
const invalidateUsersCache = async (userId = null) => {
    try {
        if (redisClient) {
            await redisClient.del('users:all');
            console.log('🗑️ Cache DELETED: users:all');
            
            if (userId) {
                await redisClient.del(`users:${userId}`);
                console.log(`🗑️ Cache DELETED: users:${userId}`);
            }
        }
    } catch (err) {
        console.error('Users cache invalidate error:', err);
    }
};

// Очистка кэша товаров
const invalidateProductsCache = async (productId = null) => {
    try {
        if (redisClient) {
            await redisClient.del('products:all');
            console.log('🗑️ Cache DELETED: products:all');
            
            if (productId) {
                await redisClient.del(`products:${productId}`);
                console.log(`🗑️ Cache DELETED: products:${productId}`);
            }
        }
    } catch (err) {
        console.error('Products cache invalidate error:', err);
    }
};

// Получить redis клиент
const getRedisClient = () => redisClient;

module.exports = {
    initRedis,
    cacheMiddleware,
    saveToCache,
    invalidateUsersCache,
    invalidateProductsCache,
    getRedisClient
};