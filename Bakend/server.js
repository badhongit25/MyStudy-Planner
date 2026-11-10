
// ======================================
// MyStudy Planner - Backend Server
// ======================================

const path = require("path");
const os = require("os");

// Load environment variables reliably
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");

// Database connection
const pool = require("./config/db");

// Routes
const authRoutes = require("./routes/authRoutes");
const taskRoutes = require("./routes/taskRoutes");

const app = express();

// ======================================
// CORS CONFIGURATION (CROSS-DEVICE READY)
// ======================================
// Enables cross-device access from mobile phones, laptops, and local network IPs
const corsOptions = {
    origin: function(origin, callback) {
        // Allow all origins (mobile browsers, localhost, LAN IPs, file://, and deployed web apps)
        return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"],
    exposedHeaders: ["Authorization"]
};

// Express 5 compatible CORS middleware (automatically handles OPTIONS preflights)
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ======================================
// SERVE FRONTEND STATIC ASSETS
// ======================================
const frontendPath = path.join(__dirname, "..");
app.use(express.static(frontendPath));

// ======================================
// HEALTH CHECK & STATUS API
// ======================================
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "MyStudy Planner Backend is healthy and running!",
        timestamp: new Date().toISOString()
    });
});

// Database Test API
app.get("/api/test-db", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW() AS current_time");
        res.json({
            success: true,
            message: "PostgreSQL Database Connected Successfully!",
            time: result.rows[0].current_time
        });
    } catch (error) {
        console.error("Database Test Error:", error.message);
        res.status(500).json({
            success: false,
            message: "Database Connection Failed",
            error: error.message
        });
    }
});

// ======================================
// API ROUTES
// ======================================
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);

// Fallback to index.html for non-API client routes (Express 5 compatible)
app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
        return res.status(404).json({ success: false, message: "API route not found" });
    }
    res.sendFile(path.join(frontendPath, "index.html"));
});

// ======================================
// SERVER START (LISTENS ON 0.0.0.0 FOR LAN)
// ======================================
const PORT = Number(process.env.PORT) || 5000;
const HOST = "0.0.0.0"; // Binding to 0.0.0.0 enables mobile devices on the same Wi-Fi to connect

app.listen(PORT, HOST, () => {
    console.log(`\n========================================`);
    console.log(`  MyStudy Planner Backend is Running!   `);
    console.log(`========================================`);
    console.log(`  > Local:    http://localhost:${PORT}`);

    // Print local network IP addresses for seamless mobile testing
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === "IPv4" && !net.internal) {
                console.log(`  > Network:  http://${net.address}:${PORT} (Open on Mobile!)`);
            }
        }
    }
    console.log(`========================================\n`);
});

