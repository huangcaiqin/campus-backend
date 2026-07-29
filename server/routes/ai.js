const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");

// 从环境变量获取 DeepSeek API 配置
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_BASE = process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com";

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

// ============================================================
// POST /api/ai/summarize-reviews —— 生成食堂评价的 AI 总结
// ============================================================
router.post("/summarize-reviews", authMiddleware, async (req, res) => {
  try {
    const db = req.app.get("db");
    const { canteen_id } = req.body;

    // 参数校验
    if (!canteen_id) {
      return res.status(400).json({ code: 400, data: null, message: "canteen_id 必填" });
    }

    // 1. 查询该食堂最近 20 条评价
    const result = db.exec(
      `SELECT content, rating FROM reviews WHERE canteen_id = ${parseInt(canteen_id, 10)} ORDER BY created_at DESC, id DESC LIMIT 20`
    );
    const reviews = rowsToObjects(result);

    // 2. 如果没有评价，直接返回提示
    if (reviews.length === 0) {
      return res.json({
        code: 200,
        data: { summary: "该食堂暂无评价" },
        message: "success",
      });
    }

    // 3. 拼接评价内容文本
    const reviewsText = reviews
      .map((r) => `评分${r.rating}星：${r.content}`)
      .join("\n");

    // 4. 构造 DeepSeek API 请求
    const apiUrl = `${DEEPSEEK_API_BASE}/chat/completions`;
    const requestBody = {
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content:
            "你是一个校园生活助手。请根据以下食堂评价，用3句话总结：\n第1句：整体口碑如何（学生们普遍满意还是有怨言）\n第2句：最受欢迎或最常被提到的菜品是什么\n第3句：价格水平如何\n\n请直接输出3句话总结，不要加标题和编号。每句话不超过40字。",
        },
        {
          role: "user",
          content: `以下是食堂评价：\n${reviewsText}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
    };

    // 5. 调用 DeepSeek API（15秒超时）
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let apiResponse;
    try {
      apiResponse = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr.name === "AbortError") {
        console.error("DeepSeek API 请求超时:", fetchErr.message);
        return res
          .status(500)
          .json({ code: 500, data: null, message: "AI服务暂时不可用，请稍后重试" });
      }
      console.error("DeepSeek API 请求失败:", fetchErr.message);
      return res
        .status(500)
        .json({ code: 500, data: null, message: "AI服务暂时不可用，请稍后重试" });
    }
    clearTimeout(timeout);

    // 检查 HTTP 状态码
    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      console.error(`DeepSeek API 返回错误 (${apiResponse.status}):`, errText);
      return res
        .status(500)
        .json({ code: 500, data: null, message: "AI服务暂时不可用，请稍后重试" });
    }

    // 6. 解析返回结果
    const apiData = await apiResponse.json();
    const summary = apiData.choices?.[0]?.message?.content;

    if (!summary) {
      console.error("DeepSeek API 返回数据格式异常:", JSON.stringify(apiData));
      return res
        .status(500)
        .json({ code: 500, data: null, message: "AI服务暂时不可用，请稍后重试" });
    }

    // 7. 返回 AI 生成的总结
    res.json({
      code: 200,
      data: { summary: summary.trim() },
      message: "success",
    });
  } catch (err) {
    console.error("评价总结失败:", err.message);
    res.status(500).json({ code: 500, data: null, message: "AI服务暂时不可用，请稍后重试" });
  }
});

// ============================================================
// POST /api/ai/generate-description —— AI 生成二手商品描述
// ============================================================
router.post("/generate-description", async (req, res) => {
  try {
    const { title, condition, price, usage } = req.body;

    // 1. 验证必填字段：title 和 price 必填
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ code: 400, data: null, message: "商品名称必填" });
    }
    if (price === undefined || price === null || isNaN(parseFloat(price))) {
      return res.status(400).json({ code: 400, data: null, message: "价格必填" });
    }

    // 2. 构造 DeepSeek API 请求
    const apiUrl = `${DEEPSEEK_API_BASE}/chat/completions`;
    const requestBody = {
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content:
            "你是一个校园二手交易平台的助手。请根据用户提供的商品信息，生成一段吸引人的商品描述。\n\n要求：\n- 语气活泼、亲切，符合大学生风格\n- 突出商品的核心卖点\n- 提到原价和现价的对比（如果价格合理的话）\n- 适当使用emoji\n- 长度控制在50-100字\n- 直接输出描述文案，不要加标题",
        },
        {
          role: "user",
          content: `商品名称：${title.trim()}\n成色：${condition || "未提供"}\n售价：${price}元\n使用情况：${usage || "未提供"}`,
        },
      ],
      temperature: 0.8,
      max_tokens: 300,
    };

    // 3. 调用 DeepSeek API（15秒超时）
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let apiResponse;
    try {
      apiResponse = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr.name === "AbortError") {
        console.error("DeepSeek API 请求超时:", fetchErr.message);
        return res
          .status(500)
          .json({ code: 500, data: null, message: "AI服务暂时不可用，请稍后重试" });
      }
      console.error("DeepSeek API 请求失败:", fetchErr.message);
      return res
        .status(500)
        .json({ code: 500, data: null, message: "AI服务暂时不可用，请稍后重试" });
    }
    clearTimeout(timeout);

    // 检查 HTTP 状态码
    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      console.error(`DeepSeek API 返回错误 (${apiResponse.status}):`, errText);
      return res
        .status(500)
        .json({ code: 500, data: null, message: "AI服务暂时不可用，请稍后重试" });
    }

    // 4. 解析返回结果
    const apiData = await apiResponse.json();
    const description = apiData.choices?.[0]?.message?.content;

    if (!description) {
      console.error("DeepSeek API 返回数据格式异常:", JSON.stringify(apiData));
      return res
        .status(500)
        .json({ code: 500, data: null, message: "AI服务暂时不可用，请稍后重试" });
    }

    // 5. 返回 AI 生成的描述
    res.json({
      code: 200,
      data: { description: description.trim() },
      message: "success",
    });
  } catch (err) {
    console.error("商品描述生成失败:", err.message);
    res.status(500).json({ code: 500, data: null, message: "AI服务暂时不可用，请稍后重试" });
  }
});

module.exports = router;
