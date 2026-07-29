const express = require("express");
const router = express.Router();

const CATEGORIES = ["教材", "电子", "生活", "其他"];
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
// 1. GET / —— 获取商品列表（搜索 + 筛选 + 分页）
// ============================================================
router.get("/", async (req, res) => {
  try {
    const db = req.app.get("db");
    const keyword = (req.query.keyword || "").trim();
    const category = req.query.category || "";
    const status = req.query.status || "在售";
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (keyword) {
      const esc = keyword.replace(/'/g, "''");
      conditions.push(`(title LIKE '%${esc}%' OR description LIKE '%${esc}%')`);
    }
    if (category && CATEGORIES.includes(category)) {
      conditions.push(`category = '${category}'`);
    }
    if (status) {
      conditions.push(`COALESCE(status, '在售') = '${status}'`);
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";

    const totalResult = db.exec(`SELECT COUNT(*) AS cnt FROM items${where}`);
    const total = totalResult[0]?.values[0][0] || 0;

    const dataResult = db.exec(
      `SELECT * FROM items${where} ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`
    );
    const items = rowsToObjects(dataResult);

    // Ensure status field exists for each item
    items.forEach((item) => {
      if (item.status === undefined || item.status === null) {
        item.status = "在售";
      }
    });

    res.json({
      code: 200,
      data: { items, total, page, limit },
      message: "success",
    });
  } catch (err) {
    console.error("商品查询失败:", err.message);
    res.status(500).json({ code: 500, data: null, message: "数据库查询失败" });
  }
});

// ============================================================
// 2. GET /:id —— 获取商品详情
// ============================================================
router.get("/:id", async (req, res) => {
  try {
    const db = req.app.get("db");
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ code: 400, data: null, message: "无效的商品ID" });
    }

    const result = db.exec(`SELECT * FROM items WHERE id = ${id}`);
    const item = rowsToObject(result);

    if (!item) {
      return res.status(404).json({ code: 404, data: null, message: "商品不存在" });
    }

    if (item.status === undefined || item.status === null) {
      item.status = "在售";
    }

    res.json({ code: 200, data: item, message: "success" });
  } catch (err) {
    console.error("商品查询失败:", err.message);
    res.status(500).json({ code: 500, data: null, message: "数据库查询失败" });
  }
});

// ============================================================
// 3. POST / —— 发布新商品
// ============================================================
router.post("/", authMiddleware, async (req, res) => {
  try {
    const db = req.app.get("db");
    const { title, description, price, category, images, contact } = req.body;

    // Validation
    if (!title || typeof title !== "string" || title.trim().length < 2 || title.trim().length > 30) {
      return res.status(400).json({ code: 400, data: null, message: "商品标题2-30个字" });
    }
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      return res.status(400).json({ code: 400, data: null, message: "请输入有效的价格" });
    }
    if (!category || !CATEGORIES.includes(category)) {
      return res.status(400).json({ code: 400, data: null, message: "分类必须是教材/电子/生活/其他" });
    }

    const trimmedTitle = title.trim();
    const desc = (description || "").trim();
    const contactVal = (contact || "").trim();
    const imagesStr = Array.isArray(images) ? JSON.stringify(images) : (images || "");

    const seller = req.user.username;
    const userId = req.user.userId;

    // Check if status column exists — if not, omit it
    const colCheck = db.exec("PRAGMA table_info(items)");
    const hasStatus = colCheck[0]?.values.some((v) => v[1] === "status");

    if (hasStatus) {
      db.run(
        "INSERT INTO items (title, price, category, seller, contact, description, image, status, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, '在售', ?)",
        [trimmedTitle, priceNum, category, seller, contactVal, desc, imagesStr, userId]
      );
    } else {
      db.run(
        "INSERT INTO items (title, price, category, seller, contact, description, image, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [trimmedTitle, priceNum, category, seller, contactVal, desc, imagesStr, userId]
      );
    }

    const { saveDatabase } = require("../database/connection");
    saveDatabase();

    const newResult = db.exec("SELECT * FROM items ORDER BY id DESC LIMIT 1");
    const newItem = rowsToObject(newResult);
    if (newItem && (newItem.status === undefined || newItem.status === null)) {
      newItem.status = "在售";
    }

    res.status(201).json({ code: 201, data: newItem, message: "发布成功" });
  } catch (err) {
    console.error("商品发布失败:", err.message);
    res.status(500).json({ code: 500, data: null, message: "数据库写入失败" });
  }
});

// ============================================================
// 4. PUT /:id —— 修改商品
// ============================================================
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const db = req.app.get("db");
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ code: 400, data: null, message: "无效的商品ID" });
    }

    const existResult = db.exec(`SELECT * FROM items WHERE id = ${id}`);
    const existing = rowsToObject(existResult);
    if (!existing) {
      return res.status(404).json({ code: 404, data: null, message: "商品不存在" });
    }

    // Permission check: verify ownership via user_id
    if (!existing.user_id || existing.user_id !== req.user.userId) {
      return res.status(403).json({ code: 403, data: null, message: "无权修改此商品" });
    }

    const { title, description, price, category, status, contact } = req.body;
    const updates = [];
    const params = [];

    if (title !== undefined) {
      if (typeof title !== "string" || title.trim().length < 2 || title.trim().length > 30) {
        return res.status(400).json({ code: 400, data: null, message: "商品标题2-30个字" });
      }
      updates.push("title = ?");
      params.push(title.trim());
    }
    if (description !== undefined) {
      updates.push("description = ?");
      params.push(description.trim());
    }
    if (price !== undefined) {
      const p = parseFloat(price);
      if (isNaN(p) || p <= 0) return res.status(400).json({ code: 400, data: null, message: "请输入有效的价格" });
      updates.push("price = ?");
      params.push(p);
    }
    if (category !== undefined) {
      if (!CATEGORIES.includes(category)) return res.status(400).json({ code: 400, data: null, message: "分类无效" });
      updates.push("category = ?");
      params.push(category);
    }
    if (status !== undefined) {
      updates.push("status = ?");
      params.push(status);
    }
    if (contact !== undefined) {
      updates.push("contact = ?");
      params.push(contact.trim());
    }

    if (updates.length === 0) {
      return res.status(400).json({ code: 400, data: null, message: "没有需要更新的字段" });
    }

    params.push(id);
    db.run(`UPDATE items SET ${updates.join(", ")} WHERE id = ?`, params);

    const { saveDatabase } = require("../database/connection");
    saveDatabase();

    const updatedResult = db.exec(`SELECT * FROM items WHERE id = ${id}`);
    const updated = rowsToObject(updatedResult);
    if (updated && (updated.status === undefined || updated.status === null)) {
      updated.status = "在售";
    }

    res.json({ code: 200, data: updated, message: "修改成功" });
  } catch (err) {
    console.error("商品修改失败:", err.message);
    res.status(500).json({ code: 500, data: null, message: "数据库更新失败" });
  }
});

// ============================================================
// 5. DELETE /:id —— 软删除（下架）
// ============================================================
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const db = req.app.get("db");
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ code: 400, data: null, message: "无效的商品ID" });
    }

    const existResult = db.exec(`SELECT * FROM items WHERE id = ${id}`);
    const existing = rowsToObject(existResult);
    if (!existing) {
      return res.status(404).json({ code: 404, data: null, message: "商品不存在" });
    }

    // Permission check: verify ownership via user_id
    if (!existing.user_id || existing.user_id !== req.user.userId) {
      return res.status(403).json({ code: 403, data: null, message: "无权下架此商品" });
    }

    // Check if status column exists
    const colCheck = db.exec("PRAGMA table_info(items)");
    const hasStatus = colCheck[0]?.values.some((v) => v[1] === "status");

    if (hasStatus) {
      db.run("UPDATE items SET status = '已售出' WHERE id = ?", [id]);
    } else {
      // Fallback: actually delete
      db.run("DELETE FROM items WHERE id = ?", [id]);
    }

    const { saveDatabase } = require("../database/connection");
    saveDatabase();

    res.json({ code: 200, data: null, message: "下架成功" });
  } catch (err) {
    console.error("商品下架失败:", err.message);
    res.status(500).json({ code: 500, data: null, message: "数据库操作失败" });
  }
});

module.exports = router;
