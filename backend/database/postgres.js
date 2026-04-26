const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    host: process.env.PG_HOST,
    port: process.env.PG_PORT,
    database: process.env.PG_DATABASE,
});

const initPostgres = async () => {
    const createUsersTable = `
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(50) DEFAULT 'user',
            blocked BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    const createProductsTable = `
        CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            name VARCHAR(200) NOT NULL,
            price INTEGER NOT NULL,
            description TEXT,
            stock INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    await pool.query(createUsersTable);
    await pool.query(createProductsTable);
    console.log('✅ PostgreSQL: таблицы созданы');
    
    // Добавляем тестового админа если нет
    const adminCheck = await pool.query('SELECT * FROM users WHERE username = $1', ['admin']);
    if (adminCheck.rows.length === 0) {
        const bcrypt = require('bcrypt');
        const hash = await bcrypt.hash('admin', 10);
        await pool.query(
            'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)',
            ['admin', hash, 'admin']
        );
        console.log('✅ Создан тестовый пользователь admin/admin');
    }
};

module.exports = { pool, initPostgres };