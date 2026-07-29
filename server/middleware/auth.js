const jwt = require("jsonwebtoken");

const JWT_SECRET = "campus-life-secret-key";

/**
 * 认证中间件：验证 JWT Token
 * - 从请求头 Authorization 提取 Bearer <token>
 * - 验证 Token 有效性
 * - 有效则将 userId 和 username 挂载到 req.user
 * - 无效或不存在则返回 401
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ code: 401, data: null, message: "未授权，请先登录" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { userId: decoded.userId, username: decoded.username };
    next();
  } catch (err) {
    return res.status(401).json({ code: 401, data: null, message: "Token无效或已过期，请重新登录" });
  }
}

module.exports = { authMiddleware, JWT_SECRET };
