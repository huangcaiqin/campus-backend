const express = require("express");
const router = express.Router();
const { getConnection, saveDatabase } = require("../database/connection");
const { authMiddleware } = require("../middleware/auth");

// ---- Helper: convert db.exec result to array of objects ----
function rowsToObjects(result) {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
}

// ---- Helper: get single row by id ----
function rowsToObject(result) {
  const rows = rowsToObjects(result);
  return rows.length > 0 ? rows[0] : null;
}

// ============================================================
// 1. GET / —— 获取评价列表（分页 + 按食堂筛选）
// ============================================================
router.get("/", async (req, res) => {
  try {
    const db = await getConnection();
    const canteenId = req.query.canteen_id ? parseInt(req.query.canteen_id, 10) : null;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    let whereClause = "";
    let totalSql = "SELECT COUNT(*) AS cnt FROM reviews";
    let dataSql = "SELECT * FROM reviews";

    if (canteenId) {
      whereClause = ` WHERE canteen_id = ${canteenId}`;
      totalSql += whereClause;
      dataSql += whereClause;
    }

    dataSql += " ORDER BY created_at DESC, id DESC";
    dataSql += ` LIMIT ${limit} OFFSET ${offset}`;

    const totalResult = db.exec(totalSql);
    const total = totalResult[0]?.values[0][0] || 0;

    const dataResult = db.exec(dataSql);
    const reviews = rowsToObjects(dataResult);

    res.json({
      code: 200,
      data: { reviews, total, page, limit },
      message: "success",
    });
  } catch (err) {
    console.error("评价查询失败:", err.message);
    res.status(500).json({ code: 500, data: null, message: "数据库查询失败" });
  }
});

// ============================================================
// 2. GET /:id —— 获取单条评价详情
// ============================================================
router.get("/:id", async (req, res) => {
  try {
    const db = await getConnection();
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ code: 400, data: null, message: "无效的评价ID" });
    }

    const result = db.exec(`SELECT * FROM reviews WHERE id = ${id}`);
    const review = rowsToObject(result);

    if (!review) {
      return res.status(404).json({ code: 404, data: null, message: "评价不存在" });
    }

    res.json({ code: 200, data: review, message: "success" });
  } catch (err) {
    console.error("评价查询失败:", err.message);
    res.status(500).json({ code: 500, data: null, message: "数据库查询失败" });
  }
});

// ============================================================
// 3. POST / —— 提交新评价
// ============================================================
router.post("/", authMiddleware, async (req, res) => {
  try {
    const db = await getConnection();
    const { canteen_id, content, rating } = req.body;

    // Validation
    if (!canteen_id) {
      return res.status(400).json({ code: 400, data: null, message: "canteen_id 必填" });
    }
    if (!content || typeof content !== "string") {
      return res.status(400).json({ code: 400, data: null, message: "评价内容必填" });
    }
    if (content.length < 1 || content.length > 500) {
      return res.status(400).json({ code: 400, data: null, message: "评价内容长度在1-500字之间" });
    }
    const ratingNum = parseInt(rating, 10);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ code: 400, data: null, message: "评分为1-5的整数" });
    }

    // Check canteen exists
    const canteenCheck = db.exec(`SELECT id FROM canteens WHERE id = ${canteen_id}`);
    if (!canteenCheck || canteenCheck[0]?.values.length === 0) {
      return res.status(400).json({ code: 400, data: null, message: "食堂不存在" });
    }

    const username = req.user.username;
    const userId = req.user.userId;
    db.run(
      "INSERT INTO reviews (canteen_id, username, content, rating, user_id) VALUES (?, ?, ?, ?, ?)",
      [canteen_id, username, content, ratingNum, userId]
    );
    saveDatabase();

    // Fetch the newly inserted review
    const newResult = db.exec("SELECT * FROM reviews ORDER BY id DESC LIMIT 1");
    const newReview = rowsToObject(newResult);

    res.status(201).json({ code: 201, data: newReview, message: "评价成功" });
  } catch (err) {
    console.error("评价提交失败:", err.message);
    res.status(500).json({ code: 500, data: null, message: "数据库写入失败" });
  }
});

// ============================================================
// 4. PUT /:id —— 修改评价
// ============================================================
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const db = await getConnection();
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ code: 400, data: null, message: "无效的评价ID" });
    }

    // Check existence
    const existResult = db.exec(`SELECT * FROM reviews WHERE id = ${id}`);
    const existing = rowsToObject(existResult);
    if (!existing) {
      return res.status(404).json({ code: 404, data: null, message: "评价不存在" });
    }

    // Permission check: verify ownership via user_id
    if (!existing.user_id || existing.user_id !== req.user.userId) {
      return res.status(403).json({ code: 403, data: null, message: "无权修改此评价" });
    }

    const { content, rating } = req.body;
    const updates = [];
    const params = [];

    if (content !== undefined) {
      if (typeof content !== "string" || content.length < 1 || content.length > 500) {
        return res.status(400).json({ code: 400, data: null, message: "评价内容长度在1-500字之间" });
      }
      updates.push("content = ?");
      params.push(content);
    }
    if (rating !== undefined) {
      const r = parseInt(rating, 10);
      if (isNaN(r) || r < 1 || r > 5) {
        return res.status(400).json({ code: 400, data: null, message: "评分为1-5的整数" });
      }
      updates.push("rating = ?");
      params.push(r);
    }

    if (updates.length === 0) {
      return res.status(400).json({ code: 400, data: null, message: "没有需要更新的字段" });
    }

    params.push(id);
    db.run(`UPDATE reviews SET ${updates.join(", ")} WHERE id = ?`, params);
    saveDatabase();

    // Fetch updated review
    const updatedResult = db.exec(`SELECT * FROM reviews WHERE id = ${id}`);
    const updated = rowsToObject(updatedResult);

    res.json({ code: 200, data: updated, message: "修改成功" });
  } catch (err) {
    console.error("评价修改失败:", err.message);
    res.status(500).json({ code: 500, data: null, message: "数据库更新失败" });
  }
});

// ============================================================
// 5. DELETE /:id —— 删除评价
// ============================================================
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const db = await getConnection();
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ code: 400, data: null, message: "无效的评价ID" });
    }

    // Check existence
    const existResult = db.exec(`SELECT * FROM reviews WHERE id = ${id}`);
    const existing = rowsToObject(existResult);
    if (!existing) {
      return res.status(404).json({ code: 404, data: null, message: "评价不存在" });
    }

    // Permission check: verify ownership via user_id
    if (!existing.user_id || existing.user_id !== req.user.userId) {
      return res.status(403).json({ code: 403, data: null, message: "无权删除此评价" });
    }

    db.run("DELETE FROM reviews WHERE id = ?", [id]);
    saveDatabase();

    res.json({ code: 200, data: null, message: "删除成功" });
  } catch (err) {
    console.error("评价删除失败:", err.message);
    res.status(500).json({ code: 500, data: null, message: "数据库删除失败" });
  }
});

module.exports = router;
