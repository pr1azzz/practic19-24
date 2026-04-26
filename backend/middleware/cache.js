const { createClient } = require('redis');

let redisClient = null;

const initRedis = async () => {
    redisClient = createClient({
        url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
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

const cacheMiddleware = (keyBuilder, ttl) => {
    return async (req, res, next) => {
        try {
            if (!redisClient) return next();
            
            const key = keyBuilder(req);
            const cachedData = await redisClient.get(key);
            
            if (cachedData) {
                return res.json({
                    source: 'cache',
                    from_server: `backend_${process.env.PORT || 'unknown'}`,
                    data: JSON.parse(cachedData),
                    cachedAt: new Date().toISOString()
                });
            }
            
            req.cacheKey = key;
            req.cacheTTL = ttl;
            next();
        } catch (err) {
            next();
        }
    };
};

const saveToCache = async (key, data, ttl) => {
    try {
        if (redisClient) {
            await redisClient.set(key, JSON.stringify(data), { EX: ttl });
        }
    } catch (err) {}
};

const invalidateUsersCache = async (userId = null) => {
    try {
        if (redisClient) {
            await redisClient.del('users:all');
            if (userId) await redisClient.del(`users:${userId}`);
        }
    } catch (err) {}
};

const invalidateProductsCache = async (productId = null) => {
    try {
        if (redisClient) {
            await redisClient.del('products:all');
            if (productId) await redisClient.del(`products:${productId}`);
        }
    } catch (err) {}
};

module.exports = {
    initRedis,
    cacheMiddleware,
    saveToCache,
    invalidateUsersCache,
    invalidateProductsCache
};