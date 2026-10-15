// Vercel Serverless Function: пробует прочитать название и описание товара по ссылке.
// Маркетплейсы часто защищены от автоматического чтения, поэтому результат не гарантирован.

const ALLOWED = ["wildberries.ru", "wildberries.kz", "wildberries.by", "wb.ru", "ozon.ru", "ozon.kz", "kaspi.kz", "lamoda.ru", "lamoda.kz",
  "zara.com", "mango.com", "hm.com", "massimodutti.com", "bershka.com", "pullandbear.com", "stradivarius.com", "uniqlo.com", "aliexpress.com", "aliexpress.ru"];
const okHost = (h) => ALLOWED.some((d) => h === d || h.endsWith("." + d));
const decode = (s) => String(s || "").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const meta = (html, name) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i");
  const tag = (html.match(re) || [])[0]; if (!tag) return "";
  return decode((tag.match(/content=["']([^"']*)["']/i) || [])[1]);
};

async function wildberries(url) {
  const id = (url.pathname.match(/catalog\/(\d+)/) || [])[1];
  if (!id) return null;
  const r = await fetch(`https://card.wb.ru/cards/v2/detail?appType=1&curr=rub&dest=-1257786&nm=${id}`, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const p = j?.data?.products?.[0];
  if (!p) return null;
  const colors = (p.colors || []).map((c) => c.name).filter(Boolean).join(", ");
  return { title: [p.brand, p.name].filter(Boolean).join(" — "), description: colors ? `Цвет: ${colors}` : "" };
}

export default async function handler(req, res) {
  let url;
  try { url = new URL(String(req.query.url || "")); } catch { return res.status(400).json({ ok: false, error: "bad_url" }); }
  if (url.protocol !== "https:" || !okHost(url.hostname)) return res.status(400).json({ ok: false, error: "host_not_supported" });
  try {
    if (/wildberries|wb\.ru/.test(url.hostname)) {
      const w = await wildberries(url).catch(() => null);
      if (w && w.title) return res.status(200).json({ ok: true, ...w });
    }
    const r = await fetch(url.href, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TailorMapBot/1.0)", "Accept-Language": "ru,en;q=0.8", Accept: "text/html" },
      redirect: "follow", signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) return res.status(200).json({ ok: false, error: "blocked" });
    const html = (await r.text()).slice(0, 600000);
    const title = meta(html, "og:title") || decode((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]);
    const description = meta(html, "og:description") || meta(html, "description");
    if (!title && !description) return res.status(200).json({ ok: false, error: "empty" });
    return res.status(200).json({ ok: true, title: title.slice(0, 300), description: description.slice(0, 1200) });
  } catch {
    return res.status(200).json({ ok: false, error: "unreachable" });
  }
}
