const { Pool } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// Determine if SSL should be enabled (only for remote cloud databases, never for localhost)
const isRemoteUrl = process.env.DATABASE_URL && 
    !process.env.DATABASE_URL.includes("localhost") && 
    !process.env.DATABASE_URL.includes("127.0.0.1");

const isRemoteHost = process.env.DB_HOST && 
    process.env.DB_HOST !== "localhost" && 
    process.env.DB_HOST !== "127.0.0.1";

const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: isRemoteUrl ? { rejectUnauthorized: false } : false
      }
    : {
        user: process.env.DB_USER || "postgres",
        host: process.env.DB_HOST || "localhost",
        database: process.env.DB_NAME || "mystudy_planner",
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT) || 5432,
        ssl: isRemoteHost ? { rejectUnauthorized: false } : false
      };

const pool = new Pool(poolConfig);

// Handle idle connection errors
pool.on("error", (err) => {
    console.error("PostgreSQL pool idle client error:", err.message);
});

// Auto-initialize required tables if they don't exist
const initDb = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id SERIAL PRIMARY KEY,
                user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                due_date DATE NOT NULL,
                priority VARCHAR(50) NOT NULL DEFAULT 'Medium',
                completed BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Database initialized: users & tasks tables verified.");
    } catch (err) {
        console.warn("Notice: Database auto-init query warning:", err.message);
    }
};

// Run table verification
initDb();

module.exports = pool;
