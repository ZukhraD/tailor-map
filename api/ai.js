// Vercel Serverless Function: «Спросить ИИ».
// Провайдер выбирается по переменным окружения в Vercel:
//   GEMINI_API_KEY    — Google Gemini (по умолчанию; модель GEMINI_MODEL, иначе gemini-flash-latest)
//   OPENAI_API_KEY    — OpenAI (модель OPENAI_MODEL, иначе gpt-4o-mini)
//   ANTHROPIC_API_KEY — Claude (модель ANTHROPIC_MODEL, иначе claude-haiku-5-5)
// Если задано несколько ключей, используется AI_PROVIDER (gemini | openai | anthropic) или первый найденный.

const SYSTEM = `Ты — персональный стилист сервиса Tailor Map. Тебе дают модель фигуры человека (замеры, тип фигуры, рассчитанные размеры, предпочтения) и его запрос.
Отвечай по-русски, дружелюбно, конкретно и коротко, без воды.
Всегда опирайся на тип фигуры, рост, размеры и предпочтения. Не предлагай то, что человек отметил как «не носит» или «нет в гардеробе», избегай нелюбимых цветов.
Не выдумывай характеристики товара: если по описанию или скриншоту не видно посадку, длину или ткань — прямо скажи, что уточнить.
Не давай ссылок на конкретные товары — ты не можешь проверить наличие. Вместо этого предлагай поисковые фразы для маркетплейсов.
Размеры бери из профиля (для джинсов — сетки Zara и Mango) и советуй сверяться с таблицей размеров на карточке.
Оформление: короткие заголовки ### и списки «- ». Без таблиц.
Отвечай только на вопросы про одежду, обувь, аксессуары и стиль; на другие темы вежливо откажись.`;

function userPrompt(pl) {
  const prof = JSON.stringify(pl.profile || {}, null, 1).slice(0, 5000);
  if (pl.mode === "check") {
    const items = (Array.isArray(pl.items) ? pl.items : []).slice(0, 5)
      .map((it, i) => `Товар ${i + 1}${it.url ? ` (${String(it.url).slice(0, 300)})` : ""}:\n${String(it.text || "(описания нет — см. скриншот)").slice(0, 1500)}`)
      .join("\n\n");
    return `ПРОФИЛЬ:\n${prof}\n\nЗАДАЧА: оцени, подойдут ли эти товары человеку. ${pl.imagesCount ? `Приложено скриншотов карточек: ${pl.imagesCount}.` : ""}\n\n${items || "Товары на скриншотах."}\n\nФормат для каждого товара:\n### Товар N: короткое название — ✅ Подойдёт / ⚠️ Подойдёт с оговорками / ❌ Лучше не брать\n- Почему (2–4 пункта, привязанных к фигуре)\n- Какой размер брать\n- С чем носить\nВ конце одной строкой: какой товар из списка лучший.`;
  }
  return `ПРОФИЛЬ:\n${prof}\n\nЗАПРОС ЧЕЛОВЕКА: ${String(pl.text || "").slice(0, 800)}\n\nФормат ответа:\n### Что искать\n- 3–5 вариантов: крой, длина, посадка, цвет, ткань — и почему подходит именно этой фигуре\n### Размер\n### Чего избегать\n### Поисковые фразы\n- 3–4 фразы для Kaspi, Wildberries, Ozon, Lamoda\n### С чем носить`;
}

function parseImages(list) {
  const out = [];
  for (const d of (Array.isArray(list) ? list : []).slice(0, 4)) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(d));
    if (m && m[2].length < 2_500_000) out.push({ mime: m[1], data: m[2] });
  }
  return out;
}

class AiError extends Error { constructor(code, status) { super(code); this.code = code; this.status = status; } }
const timeout = (ms) => AbortSignal.timeout(ms);

async function callGemini(prompt, images) {
  const key = process.env.GEMINI_API_KEY;
  const models = [process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-2.5-flash"].filter(Boolean);
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: prompt }, ...images.map((im) => ({ inline_data: { mime_type: im.mime, data: im.data } }))] }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 1800 },
  };
  let last;
  for (const model of [...new Set(models)]) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal: timeout(50000),
    });
    if (r.status === 404) { last = new AiError("model_not_found", 502); continue; }
    if (r.status === 429) throw new AiError("rate_limited", 429);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { console.error("gemini", r.status, JSON.stringify(j).slice(0, 500)); throw new AiError(r.status === 400 || r.status === 403 ? "bad_key_or_region" : "provider_error", 502); }
    const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
    if (!text) throw new AiError("empty", 502);
    return text;
  }
  throw last || new AiError("provider_error", 502);
}

async function callOpenAI(prompt, images) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini", temperature: 0.6, max_tokens: 1800,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: [{ type: "text", text: prompt }, ...images.map((im) => ({ type: "image_url", image_url: { url: `data:${im.mime};base64,${im.data}` } }))] }],
    }),
    signal: timeout(50000),
  });
  if (r.status === 429) throw new AiError("rate_limited", 429);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error("openai", r.status, JSON.stringify(j).slice(0, 500)); throw new AiError("provider_error", 502); }
  return (j.choices?.[0]?.message?.content || "").trim();
}

async function callAnthropic(prompt, images) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5", max_tokens: 1800, system: SYSTEM,
      messages: [{ role: "user", content: [...images.map((im) => ({ type: "image", source: { type: "base64", media_type: im.mime, data: im.data } })), { type: "text", text: prompt }] }],
    }),
    signal: timeout(50000),
  });
  if (r.status === 429) throw new AiError("rate_limited", 429);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error("anthropic", r.status, JSON.stringify(j).slice(0, 500)); throw new AiError("provider_error", 502); }
  return (j.content || []).map((c) => c.text || "").join("").trim();
}

function provider() {
  const has = { gemini: !!process.env.GEMINI_API_KEY, openai: !!process.env.OPENAI_API_KEY, anthropic: !!process.env.ANTHROPIC_API_KEY };
  const want = (process.env.AI_PROVIDER || "").toLowerCase();
  if (has[want]) return want;
  return ["gemini", "openai", "anthropic"].find((k) => has[k]) || null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false, error: "method_not_allowed" }); }
  const prov = provider();
  if (!prov) return res.status(503).json({ ok: false, error: "not_configured" });
  let pl = req.body;
  if (typeof pl === "string") { try { pl = JSON.parse(pl); } catch { pl = null; } }
  if (!pl || typeof pl !== "object" || !["find", "check"].includes(pl.mode)) return res.status(400).json({ ok: false, error: "bad_request" });
  const images = pl.mode === "check" ? parseImages(pl.images) : [];
  const prompt = userPrompt({ ...pl, imagesCount: images.length });
  try {
    const text = prov === "gemini" ? await callGemini(prompt, images) : prov === "openai" ? await callOpenAI(prompt, images) : await callAnthropic(prompt, images);
    return res.status(200).json({ ok: true, text, provider: prov });
  } catch (e) {
    const code = e instanceof AiError ? e.code : (e?.name === "TimeoutError" ? "timeout" : "provider_error");
    return res.status(e instanceof AiError ? e.status : 502).json({ ok: false, error: code });
  }
}
