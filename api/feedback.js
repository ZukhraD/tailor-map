// Vercel Serverless Function: принимает отзыв с сайта и пересылает его в Telegram.
// Нужны переменные окружения в Vercel: TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID.

const LABELS = { r1: "Тип фигуры", r2: "Образы", r3: "Размеры", r4: "Удобство" };
const clip = (v, n) => String(v ?? "").slice(0, n);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return res.status(503).json({ ok: false, error: "not_configured" });

  let e = req.body;
  if (typeof e === "string") { try { e = JSON.parse(e); } catch { e = null; } }
  if (!e || typeof e !== "object") return res.status(400).json({ ok: false, error: "bad_request" });

  const score = (k) => { const n = Number(e[k]); return n >= 1 && n <= 5 ? `${n}/5` : "—"; };
  const lines = [
    `📝 Отзыв о Tailor Map${e.name ? " — " + clip(e.name, 60) : ""}`,
    ...Object.keys(LABELS).map((k) => `${LABELS[k]}: ${score(k)}`),
  ];
  if (e.liked) lines.push("", "Понравилось:", clip(e.liked, 1500));
  if (e.improve) lines.push("", "Улучшить:", clip(e.improve, 1500));
  const p = e.profile;
  if (p && typeof p === "object") {
    lines.push("", `Профиль: ${p.g === "m" ? "м" : "ж"}, ${clip(p.age, 3)} лет, ${clip(p.height, 3)} см, ${clip(p.weight, 3)} кг`,
      `Плечи ${clip(p.shoulders, 3)} · грудь ${clip(p.bust, 3)} · талия ${clip(p.waist, 3)} · бёдра ${clip(p.hips, 3)}`,
      `Тип фигуры: ${clip(p.shape, 40)}`);
  }

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: lines.join("\n").slice(0, 4000) }),
    });
    if (!r.ok) return res.status(502).json({ ok: false, error: "telegram_error" });
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(502).json({ ok: false, error: "telegram_unreachable" });
  }
}
