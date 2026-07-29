const { getConnection, saveDatabase } = require("./connection");

/**
 * 初始化数据库：创建所有数据表（如果不存在）
 * 并在首次运行时插入示例数据
 */
async function initDatabase() {
  const db = await getConnection();

  // ========== 食堂表 ==========
  console.log("【正在初始化canteens食堂数据表】");
  db.run(`
    CREATE TABLE IF NOT EXISTS canteens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      rating REAL DEFAULT 0,
      tags TEXT DEFAULT '[]',
      image TEXT DEFAULT ''
    )
  `);
  console.log("✅ canteens食堂数据表创建成功");

  // ========== 评价表 ==========
  db.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canteen_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      content TEXT NOT NULL,
      rating INTEGER NOT NULL DEFAULT 5,
      user_id INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (canteen_id) REFERENCES canteens(id)
    )
  `);

  // ========== 二手商品表 ==========
  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      price REAL NOT NULL,
      category TEXT NOT NULL,
      seller TEXT NOT NULL,
      contact TEXT DEFAULT '',
      description TEXT DEFAULT '',
      image TEXT DEFAULT '',
      status TEXT DEFAULT '在售',
      user_id INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // ========== 失物招领表 ==========
  db.run(`
    CREATE TABLE IF NOT EXISTS lost_found (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('丢失', '捡到')),
      title TEXT NOT NULL,
      location TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT DEFAULT '',
      contact TEXT DEFAULT '',
      user_id INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // ========== 用户表 ==========
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // ========== 插入示例数据（仅在首次创建表时） ==========

  // 检查是否有食堂数据
  const countResult = db.exec("SELECT COUNT(*) AS cnt FROM canteens");
  const count = countResult[0]?.values[0][0] || 0;

  if (count === 0) {
    // 食堂
    db.run("INSERT INTO canteens (name, location, rating, tags) VALUES ('第一食堂', '东校区', 4.2, '[\"自选\",\"快餐\"]')");
    db.run("INSERT INTO canteens (name, location, rating, tags) VALUES ('第二食堂', '西校区', 4.0, '[\"面食\",\"小炒\"]')");
    db.run("INSERT INTO canteens (name, location, rating, tags) VALUES ('第三食堂', '北校区', 3.8, '[\"麻辣烫\",\"盖饭\"]')");
    db.run("INSERT INTO canteens (name, location, rating, tags) VALUES ('教工食堂', '中心区', 4.5, '[\"自助\",\"点菜\"]')");

    // 评价
    db.run("INSERT INTO reviews (canteen_id, username, content, rating) VALUES (1, '小明', '红烧肉做得非常入味，肥而不腻！', 5)");
    db.run("INSERT INTO reviews (canteen_id, username, content, rating) VALUES (1, '小红', '价格实惠，但高峰期排队太久。', 4)");
    db.run("INSERT INTO reviews (canteen_id, username, content, rating) VALUES (2, '大壮', '麻辣香锅够劲，就是有点油。', 4)");
    db.run("INSERT INTO reviews (canteen_id, username, content, rating) VALUES (2, '小芳', '夜宵档的炒粉很好吃！', 5)");
    db.run("INSERT INTO reviews (canteen_id, username, content, rating) VALUES (3, '阿杰', '轻食沙拉很新鲜，减肥党福音。', 5)");
    db.run("INSERT INTO reviews (canteen_id, username, content, rating) VALUES (3, '美美', '环境确实好，但价格偏高。', 4)");
    db.run("INSERT INTO reviews (canteen_id, username, content, rating) VALUES (4, '李老师', '小份菜很贴心，一个人也能吃多样。', 4)");
    db.run("INSERT INTO reviews (canteen_id, username, content, rating) VALUES (4, '王老师', '清静适合讨论，菜品偏清淡。', 3)");

    // 二手商品
    db.run("INSERT INTO items (title, price, category, seller) VALUES ('高等数学（第七版）', 25, '教材', '学长A')");
    db.run("INSERT INTO items (title, price, category, seller) VALUES ('机械键盘 Cherry MX', 150, '电子', '同学B')");
    db.run("INSERT INTO items (title, price, category, seller) VALUES ('台灯 LED 护眼', 45, '生活', '学姐C')");
    db.run("INSERT INTO items (title, price, category, seller) VALUES ('Python编程从入门到实践', 30, '教材', '学长D')");
    db.run("INSERT INTO items (title, price, category, seller) VALUES ('蓝牙耳机 AirPods', 200, '电子', '同学E')");
    db.run("INSERT INTO items (title, price, category, seller) VALUES ('床上小桌板', 35, '生活', '学姐F')");

    // 失物招领
    db.run("INSERT INTO lost_found (type, title, location, date, description) VALUES ('丢失', '黑色钱包', '图书馆', '2025-01-10', '内有学生证和现金')");
    db.run("INSERT INTO lost_found (type, title, location, date, description) VALUES ('捡到', 'U盘 金士顿32G', '教学楼A301', '2025-01-11', '蓝色外壳')");
    db.run("INSERT INTO lost_found (type, title, location, date, description) VALUES ('丢失', '校园卡', '食堂二楼', '2025-01-12', '学号2024开头')");
    db.run("INSERT INTO lost_found (type, title, location, date, description) VALUES ('捡到', '雨伞 黑色折叠', '图书馆门口', '2025-01-12', '')");

    // 默认用户（admin / 123456）
    db.run("INSERT INTO users (username, password) VALUES ('admin', '123456')");

    saveDatabase();
    console.log("✅ 数据库初始化完成，示例数据已插入");
  } else {
    console.log("✅ 数据库已就绪（已有数据）");
  }

  // ========== 数据库迁移：为旧表补充缺失列 ==========
  try {
    const itemsCols = db.exec("PRAGMA table_info(items)");
    const hasStatus = itemsCols[0]?.values.some((v) => v[1] === "status");
    if (!hasStatus) {
      db.run("ALTER TABLE items ADD COLUMN status TEXT DEFAULT '在售'");
      saveDatabase();
      console.log("✅ items 表已添加 status 列（迁移完成）");
    }
  } catch (err) {
    console.log("⚠️ items 表 status 列迁移检查完成");
  }

  try {
    const lfCols = db.exec("PRAGMA table_info(lost_found)");
    const hasContact = lfCols[0]?.values.some((v) => v[1] === "contact");
    if (!hasContact) {
      db.run("ALTER TABLE lost_found ADD COLUMN contact TEXT DEFAULT ''");
      saveDatabase();
      console.log("✅ lost_found 表已添加 contact 列（迁移完成）");
    }
  } catch (err) {
    console.log("⚠️ lost_found 表 contact 列迁移检查完成");
  }

  // ========== 迁移：为 reviews 表补充 user_id 列 ==========
  try {
    const reviewsCols = db.exec("PRAGMA table_info(reviews)");
    const hasReviewUserId = reviewsCols[0]?.values.some((v) => v[1] === "user_id");
    if (!hasReviewUserId) {
      db.run("ALTER TABLE reviews ADD COLUMN user_id INTEGER");
      saveDatabase();
      console.log("✅ reviews 表已添加 user_id 列（迁移完成）");
    }
  } catch (err) {
    console.log("⚠️ reviews 表 user_id 列迁移检查完成");
  }

  // ========== 迁移：为 items 表补充 user_id 列 ==========
  try {
    const itemsCols = db.exec("PRAGMA table_info(items)");
    const hasItemUserId = itemsCols[0]?.values.some((v) => v[1] === "user_id");
    if (!hasItemUserId) {
      db.run("ALTER TABLE items ADD COLUMN user_id INTEGER");
      saveDatabase();
      console.log("✅ items 表已添加 user_id 列（迁移完成）");
    }
  } catch (err) {
    console.log("⚠️ items 表 user_id 列迁移检查完成");
  }

  // ========== 迁移：为 lost_found 表补充 user_id 列 ==========
  try {
    const lfCols2 = db.exec("PRAGMA table_info(lost_found)");
    const hasLfUserId = lfCols2[0]?.values.some((v) => v[1] === "user_id");
    if (!hasLfUserId) {
      db.run("ALTER TABLE lost_found ADD COLUMN user_id INTEGER");
      saveDatabase();
      console.log("✅ lost_found 表已添加 user_id 列（迁移完成）");
    }
  } catch (err) {
    console.log("⚠️ lost_found 表 user_id 列迁移检查完成");
  }
}

module.exports = { initDatabase };
