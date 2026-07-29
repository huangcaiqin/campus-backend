require('dotenv').config();

const express = require("express");
const cors = require("cors");
const { initDatabase } = require("./database/init");
const { getConnection } = require("./database/connection");

const canteensRouter = require("./routes/canteens");
const itemsRouter = require("./routes/items");
const lostFoundRouter = require("./routes/lost-found");
const reviewsRouter = require("./routes/reviews");
const authRouter = require("./routes/auth");
const aiRouter = require("./routes/ai");
const { authMiddleware } = require("./middleware/auth");

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Logger middleware
app.use((req, _res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// Routes
app.use("/api/canteens", canteensRouter);
app.use("/api/items", itemsRouter);
app.use("/api/lost-found", lostFoundRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/auth", authRouter);
app.use("/api/ai", aiRouter);

// ============================================================
// 临时测试路由：JWT 鉴权测试
// ============================================================
app.get("/api/test-auth", authMiddleware, (req, res) => {
  res.json({
    code: 200,
    data: {
      userId: req.user.userId,
      username: req.user.username,
      message: "Token 验证通过，您已登录",
    },
    message: "success",
  });
});

// Start server
(async () => {
  try {
    await initDatabase();
    console.log("✅ 数据库初始化成功");
    // 将数据库实例挂载到 app 上，方便路由文件使用
    const db = await getConnection();
    app.set("db", db);
  } catch (err) {
    console.error("❌ 数据库初始化失败:", err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`后端服务器运行在 http://localhost:${PORT}`);
  });
})();
