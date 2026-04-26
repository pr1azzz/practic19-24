const express = require('express');
const { Pool } = require('pg');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Настройка подключения к PostgreSQL
const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
});

app.use(express.json());

// ========== НАСТРОЙКА SWAGGER ==========
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'User Management API',
            version: '1.0.0',
            description: 'API для управления пользователями (Практическая работа №19)',
            contact: {
                name: 'Student',
            },
        },
        servers: [
            {
                url: `http://localhost:${PORT}`,
                description: 'Сервер разработки',
            },
        ],
        components: {
            schemas: {
                User: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'integer',
                            description: 'Уникальный идентификатор',
                            example: 1
                        },
                        first_name: {
                            type: 'string',
                            description: 'Имя пользователя',
                            example: 'Иван'
                        },
                        last_name: {
                            type: 'string',
                            description: 'Фамилия пользователя',
                            example: 'Петров'
                        },
                        age: {
                            type: 'integer',
                            description: 'Возраст',
                            example: 25
                        },
                        created_at: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Дата создания'
                        },
                        updated_at: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Дата обновления'
                        }
                    }
                },
                UserCreate: {
                    type: 'object',
                    required: ['first_name', 'last_name', 'age'],
                    properties: {
                        first_name: {
                            type: 'string',
                            example: 'Иван'
                        },
                        last_name: {
                            type: 'string',
                            example: 'Петров'
                        },
                        age: {
                            type: 'integer',
                            example: 25
                        }
                    }
                },
                Error: {
                    type: 'object',
                    properties: {
                        error: {
                            type: 'string',
                            example: 'Сообщение об ошибке'
                        }
                    }
                }
            }
        }
    },
    apis: ['./server.js'], // Файлы, содержащие аннотации JSDoc
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Проверка подключения к БД
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Ошибка подключения к PostgreSQL:', err.stack);
    } else {
        console.log('✅ Подключено к PostgreSQL');
        release();
    }
});

/**
 * @openapi
 * /api/users:
 *   post:
 *     summary: Создание нового пользователя
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserCreate'
 *     responses:
 *       201:
 *         description: Пользователь успешно создан
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Ошибка валидации
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post('/api/users', async (req, res) => {
    const { first_name, last_name, age } = req.body;

    if (!first_name || !last_name || !age) {
        return res.status(400).json({ error: 'Поля first_name, last_name и age обязательны' });
    }

    if (age < 0 || age > 150) {
        return res.status(400).json({ error: 'Возраст должен быть от 0 до 150 лет' });
    }

    try {
        const query = `
            INSERT INTO users (first_name, last_name, age) 
            VALUES ($1, $2, $3) 
            RETURNING *
        `;
        const values = [first_name, last_name, age];
        const result = await pool.query(query, values);
        
        res.status(201).json({
            message: 'Пользователь успешно создан',
            user: result.rows[0]
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при создании пользователя' });
    }
});

/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: Получение списка всех пользователей
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Список пользователей
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 */
app.get('/api/users', async (req, res) => {
    try {
        const query = `
            SELECT id, first_name, last_name, age, 
                   TO_CHAR(created_at, 'DD.MM.YYYY HH24:MI:SS') as created_at,
                   TO_CHAR(updated_at, 'DD.MM.YYYY HH24:MI:SS') as updated_at
            FROM users ORDER BY id
        `;
        const result = await pool.query(query);
        res.json({ count: result.rows.length, users: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при получении пользователей' });
    }
});

/**
 * @openapi
 * /api/users/{id}:
 *   get:
 *     summary: Получение пользователя по ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID пользователя
 *     responses:
 *       200:
 *         description: Данные пользователя
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       404:
 *         description: Пользователь не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    
    if (isNaN(id) || id <= 0) {
        return res.status(400).json({ error: 'ID должен быть положительным числом' });
    }
    
    try {
        const query = `
            SELECT id, first_name, last_name, age, 
                   TO_CHAR(created_at, 'DD.MM.YYYY HH24:MI:SS') as created_at,
                   TO_CHAR(updated_at, 'DD.MM.YYYY HH24:MI:SS') as updated_at
            FROM users WHERE id = $1
        `;
        const result = await pool.query(query, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        res.json({ user: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при получении пользователя' });
    }
});

/**
 * @openapi
 * /api/users/{id}:
 *   patch:
 *     summary: Обновление информации пользователя
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID пользователя
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               age:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Пользователь обновлен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       404:
 *         description: Пользователь не найден
 */
app.patch('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const { first_name, last_name, age } = req.body;
    
    if (isNaN(id) || id <= 0) {
        return res.status(400).json({ error: 'ID должен быть положительным числом' });
    }
    
    if (age !== undefined && (age < 0 || age > 150)) {
        return res.status(400).json({ error: 'Возраст должен быть от 0 до 150 лет' });
    }
    
    try {
        const checkQuery = 'SELECT * FROM users WHERE id = $1';
        const checkResult = await pool.query(checkQuery, [id]);
        
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        let updates = [];
        let values = [];
        let counter = 1;
        
        if (first_name !== undefined) {
            updates.push(`first_name = $${counter++}`);
            values.push(first_name);
        }
        if (last_name !== undefined) {
            updates.push(`last_name = $${counter++}`);
            values.push(last_name);
        }
        if (age !== undefined) {
            updates.push(`age = $${counter++}`);
            values.push(age);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }
        
        values.push(id);
        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${counter} RETURNING *`;
        const result = await pool.query(query, values);
        
        res.json({ message: 'Пользователь успешно обновлен', user: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при обновлении пользователя' });
    }
});

/**
 * @openapi
 * /api/users/{id}:
 *   delete:
 *     summary: Удаление пользователя
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID пользователя
 *     responses:
 *       200:
 *         description: Пользователь удален
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 deleted_user:
 *                   $ref: '#/components/schemas/User'
 *       404:
 *         description: Пользователь не найден
 */
app.delete('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    
    if (isNaN(id) || id <= 0) {
        return res.status(400).json({ error: 'ID должен быть положительным числом' });
    }
    
    try {
        const query = 'DELETE FROM users WHERE id = $1 RETURNING *';
        const result = await pool.query(query, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        res.json({ message: 'Пользователь успешно удален', deleted_user: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при удалении пользователя' });
    }
});

// Инициализация таблицы и запуск сервера
const initDatabase = async () => {
    try {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                first_name VARCHAR(100) NOT NULL,
                last_name VARCHAR(100) NOT NULL,
                age INTEGER CHECK (age > 0 AND age < 150),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await pool.query(createTableQuery);
        console.log('✅ Таблица users готова');
    } catch (err) {
        console.error('Ошибка инициализации БД:', err);
    }
};

app.listen(PORT, async () => {
    await initDatabase();
    console.log(`
    🚀 Сервер запущен на http://localhost:${PORT}
    
    📚 Swagger документация доступна по адресу:
    🔗 http://localhost:${PORT}/api-docs
    
    📋 Доступные эндпоинты:
    POST   /api/users           - Создать пользователя
    GET    /api/users           - Получить всех пользователей
    GET    /api/users/:id       - Получить пользователя по ID
    PATCH  /api/users/:id       - Обновить пользователя
    DELETE /api/users/:id       - Удалить пользователя
    `);
});