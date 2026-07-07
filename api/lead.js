// Lead intake: stores every submission in Supabase (rate-limited at the
// database), then emails a branded notification via Resend with Web3Forms
// as delivery fallback. The Supabase key used here is insert-only under RLS.
import { createHash } from "node:crypto";

const LEAD_INBOX = "thebeastgamer485@gmail.com";
const W3F_KEY = "e27e3107-f707-4b5b-8ceb-5c3d0ec9338c";

async function storeLead(req, { type, name, email, website, services }) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) return { stored: false, rateLimited: false };

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const ipHash = createHash("sha256")
    .update(ip + (process.env.IP_HASH_SALT || ""))
    .digest("hex");

  const r = await fetch(`${url}/rest/v1/leads`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      type: type === "audit" ? "audit" : "quote",
      name: String(name).slice(0, 120),
      email: String(email).slice(0, 254),
      website: website ? String(website).slice(0, 200) : null,
      services: services ? String(services).slice(0, 300) : null,
      ip_hash: ipHash,
      user_agent: String(req.headers["user-agent"] || "").slice(0, 300),
    }),
  });

  if (r.status === 201) return { stored: true, rateLimited: false };
  const body = await r.text();
  if (body.includes("RATE_LIMIT")) return { stored: false, rateLimited: true };
  console.error("supabase insert failed:", r.status, body.slice(0, 300));
  return { stored: false, rateLimited: false };
}

const esc = (s) =>
  String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

function emailHtml({ type, name, email, website, services }) {
  const isAudit = type === "audit";
  const rows = [
    ["Name", name],
    ["Email", email],
    ["Website", website || "(not provided)"],
    !isAudit && ["Services", services || "(none selected)"],
    ["Type", isAudit ? "Free audit request" : "Quote request"],
  ].filter(Boolean);

  const rowsHtml = rows
    .map(
      ([k, v], i) => `
      <tr>
        <td style="padding:12px 18px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8E817B;border-bottom:${i === rows.length - 1 ? "none" : "1px solid #F0EBE7"};white-space:nowrap;">${k}</td>
        <td style="padding:12px 18px;font-size:15px;color:#1B1512;border-bottom:${i === rows.length - 1 ? "none" : "1px solid #F0EBE7"};">${esc(v)}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#F1EFEE;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1EFEE;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- header: real logo on white -->
        <tr><td align="center" style="background:#FFFFFF;border-radius:16px 16px 0 0;padding:26px 32px 18px;">
          <img src="https://ignitestudio-three.vercel.app/assets/email-logo.png" width="140" alt="Ignite Studio"
               style="display:block;width:140px;height:auto;border:0;" />
        </td></tr>

        <!-- flame strip -->
        <tr><td style="height:5px;background:linear-gradient(100deg,#FD9004,#FA5903,#FB3607);font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- body -->
        <tr><td style="background:#FFFFFF;padding:32px;">
          <h1 style="margin:0 0 6px;font-size:22px;line-height:1.2;color:#1B1512;">
            ${isAudit ? "New free-audit request" : "New quote request"} &#127881;
          </h1>
          <p style="margin:0 0 24px;font-size:14px;color:#574E49;">
            ${esc(name)} just ${isAudit ? "asked for a free audit" : "requested a quote"} on your website.
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #F0EBE7;border-radius:12px;overflow:hidden;">
            ${rowsHtml}
          </table>

          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px auto 0;">
            <tr><td style="border-radius:999px;background:linear-gradient(100deg,#FD9004,#FA5903,#FB3607);">
              <a href="mailto:${esc(email)}?subject=${encodeURIComponent("Your Ignite Studio " + (isAudit ? "audit" : "quote"))}"
                 style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:700;color:#1A0E05;text-decoration:none;">
                Reply to ${esc(name.split(" ")[0])} &rarr;
              </a>
            </td></tr>
          </table>
        </td></tr>

        <!-- footer -->
        <tr><td style="background:#FFFFFF;border-radius:0 0 16px 16px;padding:18px 32px 26px;border-top:1px solid #F0EBE7;">
          <p style="margin:0;font-size:12px;color:#8E817B;text-align:center;">
            Sent by the Ignite Studio website &middot; replying to this email goes straight to the lead.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }
  const body = req.body || {};
  const { type, name, email, website, services, botcheck } = body;

  if (botcheck) return res.status(200).json({ success: true }); // honeypot: pretend it worked
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: "Missing or invalid fields" });
  }

  // store first: the database is the source of truth and enforces rate limits
  // (5/IP/hour, 3/email/day) — a rate-limited request sends no email.
  const db = await storeLead(req, { type, name, email, website, services });
  if (db.rateLimited) {
    return res.status(429).json({
      success: false,
      rateLimited: true,
      message: "Too many requests. Please email hello@ignitestudio.com instead.",
    });
  }

  const isAudit = type === "audit";
  const subject = isAudit
    ? `\u{1F525} Free-audit request from ${name}`
    : `\u{1F525} Quote request from ${name}${services ? " — " + services : ""}`;

  // primary: Resend (branded email)
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY not configured");
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Ignite Studio <onboarding@resend.dev>",
        to: [LEAD_INBOX],
        reply_to: email,
        subject,
        html: emailHtml({ type, name, email, website, services }),
      }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
    return res.status(200).json({ success: true, via: "resend" });
  } catch (err) {
    // fallback: Web3Forms (generic email, but the lead is never lost)
    try {
      const r2 = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: W3F_KEY,
          subject,
          from_name: "Ignite Studio Website",
          name,
          email,
          website: website || "(not provided)",
          services: services || "",
        }),
      });
      const j = await r2.json();
      if (!j.success) throw new Error("web3forms failed");
      return res.status(200).json({ success: true, via: "web3forms" });
    } catch {
      // both email routes failed — but if the lead is safe in the database,
      // the submission still succeeded from the visitor's point of view.
      if (db.stored) return res.status(200).json({ success: true, via: "database" });
      return res.status(502).json({ success: false, message: "Delivery failed" });
    }
  }
}
