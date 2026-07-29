const express = require("express");
const router = express.Router();
const { getConnection } = require("../database/connection");

// GET /api/canteens
router.get("/", async (_req, res) => {
  try {
    const db = await getConnection();
    const result = db.exec("SELECT * FROM canteens");

    let canteens = [];
    if (result.length > 0) {
      const columns = result[0].columns;
      canteens = result[0].values.map((vals) => {
        const row = {};
        columns.forEach((col, i) => {
          // Parse tags from JSON string to array
          if (col === "tags" && typeof vals[i] === "string") {
            try {
              row[col] = JSON.parse(vals[i]);
            } catch {
              row[col] = vals[i];
            }
          } else {
            row[col] = vals[i];
          }
        });
        return row;
      });
    }

    res.json({ code: 200, data: canteens, message: "success" });
  } catch (err) {
    console.error("食堂查询失败:", err.message);
    res.status(500).json({ code: 500, data: null, message: "数据库查询失败" });
  }
});

module.exports = router;
