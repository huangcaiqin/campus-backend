const express = require("express");
const router = express.Router();

const TYPES = ["丢失", "捡到"];
const { authMiddleware } = require("../middleware/auth");

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

// ---- Helper: get single row ----
function rowsToObject(result) {
  const rows = rowsToObjects(result);
  return rows.length > 0 ? rows[0] : null;
}

// ============================================================
// 1. GET / —— 获取列表（类型+关键词筛选 + 分页）
// ============================================================
router.get("/", async (req, res) => {
  try {
    const db = req.app.get("db");
    const type = req.query.type || "";
    const keyword = (req.query.keyword || "").trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (type && TYPES.includes(type)) {
      conditions.push(`type = '${type}'`);
    }
    if (keyword) {
      const esc = keyword.replace(/'/g, "''");
      conditions.push(`(title LIKE '%${esc}%' OR location LIKE '%${esc}%' OR description LIKE '%${esc}%')`);
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";

    const totalResult = db.exec(`SELECT COUNT(*) AS cnt FROM lost_found${where}`);
    const total = totalResult[0]?.values[0][0] || 0;

    const dataResult = db.exec(
      `SELECT * FROM lost_found${where} ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`
    );
    const list = rowsToObjects(dataResult);

    res.json({
      code: 200,
      data: { list, total, page, limit },
      message: "success",
    });
  } catch (err) {
    console.error("失物招领查询失败:", err.message);
    res.status(500).json({ code: 500, data: null, message: "数据库查询失败" });
  }
});

// ============================================================
// 2. GET /:id —— 获取详情
// ============================================================
router.get("/:id", async (req, res) => {
  try {
    const db = req.app.get("db");
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ code: 400, data: null, message: "无效的ID" });
    }

    const result = db.exec(`SELECT * FROM lost_found WHERE id = ${id}`);
    const item = rowsToObject(result);

    if (!item) {
      return res.status(404).json({ code: 404, data: null, message: "记录不存在" });
    }

    res.json({ code: 200, data: item, message: "success" });
  } catch (err) {
    console.error("失物招领查询失败:", err.message);
    res.status(500).json({ code: 500, data: null, message: "数据库查询失败" });
  }
});

// ============================================================
// 3. POST / —— 发布信息
// ============================================================
router.post("/", authMiddleware, async (req, res) => {
  try {
    const db = req.app.get("db");
    const { type, title, location, date, description } = req.body;

    // Validation
    if (!type || !TYPES.includes(type)) {
      return res.status(400).json({ code: 400, data: null, message: "类型必须是'丢失'或'捡到'" });
    }
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ code: 400, data: null, message: "物品名称必填" });
    }
    if (!location || typeof location !== "string" || !location.trim()) {
      return res.status(400).json({ code: 400, data: null, message: "地点必填" });
    }
    if (!date || typeof date !== "string") {
      return res.status(400).json({ code: 400, data: null, message: "时间必填" });
    }
    if (!description || typeof description !== "string" || !description.trim()) {
      return res.status(400).json({ code: 400, data: null, message: "描述必填" });
    }

    const trimmedTitle = title.trim();
    const trimmedLocation = location.trim();
    const trimmedDesc = description.trim();
    const userId = req.user.userId;

    db.run(
      "INSERT INTO lost_found (type, title, location, date, description, user_id) VALUES (?, ?, ?, ?, ?, ?)",
      [type, trimmedTitle, trimmedLocation, date, trimmedDesc, userId]
    );

    const { saveDatabase } = require("../database/connection");
    saveDatabase();

    const newResult = db.exec("SELECT * FROM lost_found ORDER BY id DESC LIMIT 1");
    const newItem = rowsToObject(newResult);

    res.status(201).json({ code: 201, data: newItem, message: "发布成功" });
  } catch (err) {
    console.error("失物招领发布失败:", err.message);
    res.status(500).json({ code: 500, data: null, message: "数据库写入失败" });
  }
});

// ============================================================
// 4. PUT /:id —— 修改信息
// ============================================================
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const db = req.app.get("db");
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ code: 400, data: null, message: "无效的ID" });
    }

    const existResult = db.exec(`SELECT * FROM lost_found WHERE id = ${id}`);
    const existing = rowsToObject(existResult);
    if (!existing) {
      return res.status(404).json({ code: 404, data: null, message: "记录不存在" });
    }

    // Permission check: verify ownership via user_id
    if (!existing.user_id || existing.user_id !== req.user.userId) {
      return res.status(403).json({ code: 403, data: null, message: "无权修改此记录" });
    }

    const { type, title, location, date, description } = req.body;
    const updates = [];
    const params = [];

    if (type !== undefined) {
      if (!TYPES.includes(type)) return res.status(400).json({ code: 400, data: null, message: "类型无效" });
      updates.push("type = ?");
      params.push(type);
    }
    if (title !== undefined) {
      if (!title.trim()) return res.status(400).json({ code: 400, data: null, message: "物品名称不能为空" });
      updates.push("title = ?");
      params.push(title.trim());
    }
    if (location !== undefined) {
      if (!location.trim()) return res.status(400).json({ code: 400, data: null, message: "地点不能为空" });
      updates.push("location = ?");
      params.push(location.trim());
    }
    if (date !== undefined) {
      updates.push("date = ?");
      params.push(date);
    }
    if (description !== undefined) {
      updates.push("description = ?");
      params.push(description.trim());
    }

    if (updates.length === 0) {
      return res.status(400).json({ code: 400, data: null, message: "没有需要更新的字段" });
    }

    params.push(id);
    db.run(`UPDATE lost_found SET ${updates.join(", ")} WHERE id = ?`, params);

    const { saveDatabase } = require("../database/connection");
    saveDatabase();

    const updatedResult = db.exec(`SELECT * FROM lost_found WHERE id = ${id}`);
    const updated = rowsToObject(updatedResult);

    res.json({ code: 200, data: updated, message: "修改成功" });
  } catch (err) {
    console.error("失物招领修改失败:", err.message);
    res.status(500).json({ code: 500, data: null, message: "数据库更新失败" });
  }
});

// ============================================================
// 5. DELETE /:id —— 删除（真删除）
// ============================================================
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const db = req.app.get("db");
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ code: 400, data: null, message: "无效的ID" });
    }

    const existResult = db.exec(`SELECT * FROM lost_found WHERE id = ${id}`);
    const existing = rowsToObject(existResult);
    if (!existing) {
      return res.status(404).json({ code: 404, data: null, message: "记录不存在" });
    }

    // Permission check: verify ownership via user_id
    if (!existing.user_id || existing.user_id !== req.user.userId) {
      return res.status(403).json({ code: 403, data: null, message: "无权删除此记录" });
    }

    db.run("DELETE FROM lost_found WHERE id = ?", [id]);

    const { saveDatabase } = require("../database/connection");
    saveDatabase();

    res.json({ code: 200, data: null, message: "删除成功" });
  } catch (err) {
    console.error("失物招领删除失败:", err.message);
    res.status(500).json({ code: 500, data: null, message: "数据库删除失败" });
  }
});

module.exports = router;
