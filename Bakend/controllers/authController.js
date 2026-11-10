
const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const getJwtSecret = () => {
    return process.env.JWT_SECRET || "myStudyPlanner_Secret_2026_ChangeThisToARandomLongSecret";
};

// =========================
// STUDENT REGISTRATION
// =========================
const register = async (req, res) => {
    try {
        const { full_name, email, password } = req.body;

        if (!full_name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        const cleanName = full_name.trim();
        const normalizedEmail = email.trim().toLowerCase();

        if (cleanName.length < 2) {
            return res.status(400).json({
                success: false,
                message: "Name must be at least 2 characters long"
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters"
            });
        }

        // Case-insensitive email check across all devices
        const existingUser = await pool.query(
            "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
            [normalizedEmail]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Email already registered. Please log in."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `INSERT INTO users (full_name, email, password_hash)
             VALUES ($1, $2, $3)
             RETURNING id, full_name, email, created_at`,
            [cleanName, normalizedEmail, passwordHash]
        );

        const newUser = result.rows[0];

        // Generate JWT token so account is immediately authenticated if needed
        const token = jwt.sign(
            { id: newUser.id },
            getJwtSecret(),
            { expiresIn: "30d" }
        );

        return res.status(201).json({
            success: true,
            message: "Registration successful!",
            token,
            user: {
                id: newUser.id,
                full_name: newUser.full_name,
                email: newUser.email
            }
        });

    } catch (error) {
        console.error("Registration error:", error.message);

        return res.status(500).json({
            success: false,
            message: error.message || "Database connection error during registration"
        });
    }
};


// =========================
// STUDENT LOGIN
// =========================
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Case-insensitive lookup prevents cross-device login failure (e.g. mobile capitalization)
        const result = await pool.query(
            "SELECT * FROM users WHERE LOWER(email) = LOWER($1)",
            [normalizedEmail]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const user = result.rows[0];

        const isMatch = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        // Long-lived 30-day token keeps session persistently logged in
        const token = jwt.sign(
            { id: user.id },
            getJwtSecret(),
            { expiresIn: "30d" }
        );

        return res.status(200).json({
            success: true,
            message: "Login successful!",
            token,
            user: {
                id: user.id,
                full_name: user.full_name,
                email: user.email
            }
        });

    } catch (error) {
        console.error("Login error:", error.message);

        return res.status(500).json({
            success: false,
            message: error.message || "Server or database error during login"
        });
    }
};


// =========================
// GET STUDENT PROFILE (VERIFY TOKEN)
// =========================
const getProfile = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, full_name, email, created_at
             FROM users
             WHERE id = $1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        return res.json({
            success: true,
            user: result.rows[0]
        });

    } catch (error) {
        console.error("Profile error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server error retrieving profile"
        });
    }
};


module.exports = {
    register,
    login,
    getProfile
};
