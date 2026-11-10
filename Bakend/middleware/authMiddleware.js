
const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Access denied. Please login."
            });
        }

        const token = authHeader.split(" ")[1];
        const secret = process.env.JWT_SECRET || "myStudyPlanner_Secret_2026_ChangeThisToARandomLongSecret";

        const decoded = jwt.verify(token, secret);

        req.user = decoded;
        next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token"
        });
    }
};

module.exports = authMiddleware;
