const jwt = require('jsonwebtoken');

// Middleware для проверки JWT токена
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = payload;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Недействительный или просроченный токен' });
    }
};

// Middleware для проверки роли
const roleMiddleware = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Требуется авторизация' });
        }
        
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Недостаточно прав' });
        }
        
        next();
    };
};

// Генерация Access Token
const generateAccessToken = (user) => {
    return jwt.sign(
        { sub: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
    );
};

// Генерация Refresh Token
const generateRefreshToken = (user) => {
    return jwt.sign(
        { sub: user.id, username: user.username, role: user.role },
        process.env.REFRESH_SECRET,
        { expiresIn: '7d' }
    );
};

module.exports = {
    authMiddleware,
    roleMiddleware,
    generateAccessToken,
    generateRefreshToken
};