const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { authMiddleware, JWT_SECRET } = require("../middleware/auth");

const router = express.Router();

// ---- Helper: convert db.exec result to array of objects ----
function rowsToObjects(result) {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj = {};
    columns.forEach((col, i) => (obj[col] = row[i]));
    return obj;
  });
}

function rowsToObject(result) {
  const rows = rowsToObjects(result);
  return rows.length > 0 ? rows[0] : null;
}

// ============================================================
// POST /api/auth/register —— 用户注册
// ============================================================
router.post("/register", async (req, res) => {
  try {
    const db = req.app.get("db");
    const { username, password } = req.body;

    // 验证 username
    if (!username || typeof username !== "string") {
      return res.status(400).json({ code: 400, data: null, message: "用户名必填" });
    }
    if (!/^[a-zA-Z0-9]{3,16}$/.test(username)) {
      return res.status(400).json({ code: 400, data: null, message: "用户名只能包含字母和数字，3-16字" });
    }

    // 验证 password
    if (!password || typeof password !== "string") {
      return res.status(400).json({ code: 400, data: null, message: "密码必填" });
    }
    if (password.length < 6 || password.length > 20) {
      return res.status(400).json({ code: 400, data: null, message: "密码长度6-20位" });
    }

    // 检查用户名是否已存在
    const existResult = db.exec(`SELECT id FROM users WHERE username = '${username.replace(/'/g, "''")}'`);
    if (existResult && existResult[0]?.values.length > 0) {
      return res.status(400).json({ code: 400, data: null, message: "用户名已存在" });
    }

    // 加密密码
    const hashedPassword = bcrypt.hashSync(password, 10);

    // 存入数据库
    db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword]);

    const { saveDatabase } = require("../database/connection");
    saveDatabase();

    // 获取新用户
    const newResult = db.exec(`SELECT id, username FROM users WHERE username = '${username.replace(/'/g, "''")}'`);
    const newUser = rowsToObject(newResult);

    res.status(201).json({
      code: 201,
      data: { id: newUser.id, username: newUser.username },
      message: "注册成功",
    });
  } catch (err) {
    console.error("注册失败:", err.message);
    res.status(500).json({ code: 500, data: null, message: "注册失败，服务器错误" });
  }
});

// ============================================================
// POST /api/auth/login —— 用户登录
// ============================================================
router.post("/login", async (req, res) => {
  try {
    const db = req.app.get("db");
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ code: 400, data: null, message: "用户名和密码必填" });
    }

    // 查询用户
    const result = db.exec(`SELECT * FROM users WHERE username = '${username.replace(/'/g, "''")}'`);
    const user = rowsToObject(result);

    if (!user) {
      return res.status(400).json({ code: 400, data: null, message: "用户名或密码错误" });
    }

    // 验证密码
    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ code: 400, data: null, message: "用户名或密码错误" });
    }

    // 生成 JWT Token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      code: 200,
      data: {
        token,
        user: { id: user.id, username: user.username },
      },
      message: "登录成功",
    });
  } catch (err) {
    console.error("登录失败:", err.message);
    res.status(500).json({ code: 500, data: null, message: "登录失败，服务器错误" });
  }
});

// ============================================================
// GET /api/auth/me —— 获取当前用户信息（需要认证）
// ============================================================
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const db = req.app.get("db");
    const userId = req.user.userId;

    const result = db.exec(`SELECT id, username, created_at FROM users WHERE id = ${userId}`);
    const user = rowsToObject(result);

    if (!user) {
      return res.status(404).json({ code: 404, data: null, message: "用户不存在" });
    }

    res.json({
      code: 200,
      data: {
        id: user.id,
        username: user.username,
        avatar: "",
        created_at: user.created_at,
      },
      message: "success",
    });
  } catch (err) {
    console.error("获取用户信息失败:", err.message);
    res.status(500).json({ code: 500, data: null, message: "服务器错误" });
  }
});

module.exports = router;
