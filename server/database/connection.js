const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "campus.db");

let db = null;

/**
 * 获取数据库连接（单例）
 * 如果数据库文件存在则加载，否则创建新的
 */
async function getConnection() {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  return db;
}

/**
 * 将数据库保存到磁盘文件
 */
function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

/**
 * 关闭数据库连接
 */
function closeDatabase() {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
  }
}

module.exports = { getConnection, saveDatabase, closeDatabase };
