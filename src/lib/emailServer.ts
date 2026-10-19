import "server-only";
import { getPrefs, type NotificationCategory } from "@/lib/notificationPrefsServer";

/**
 * Transactional email from rentpact.homes, sent through Resend's HTTP API (free tier: a few thousand a
 * month). Push only reaches people who switched notifications on; email reaches everyone — including a
 * landlord who doesn't have an account yet and is being invited to sign a lease.
 *
 * Off until RESEND_API_KEY and EMAIL_FROM are set (the domain must be verified in Resend first); every send is
 * best-effort and never fails the action that triggered it. Event emails respect the same per-category
 * switches as in-app notifications (/settings/notifications); account emails (verification decisions) always send.
 */

const RESEND_API = "https://api.resend.com/emails";
export const APP_URL = (process.env.APP_URL ?? "https://rentpact.homes").replace(/\/$/, "");

export interface EmailContent {
  subject: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; path: string };
}

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function renderHtml(c: EmailContent): string {
  const button = c.cta
    ? `<p style="margin:28px 0 8px"><a href="${APP_URL}${escape(c.cta.path)}" style="display:inline-block;background:#0B3D2E;color:#FDFCFA;text-decoration:none;font-weight:600;padding:13px 26px;border-radius:999px">${escape(c.cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#FAF6EF;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#141414">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF6EF;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 4px 18px"><img src="${APP_URL}/brand/logo-mark-white-bg.png" width="44" height="44" alt="RentPact" style="vertical-align:middle;border-radius:8px"> <span style="font-family:Georgia,serif;font-size:20px;color:#0B3D2E;vertical-align:middle;margin-left:8px">RentPact</span></td></tr>
<tr><td style="background:#FDFCFA;border:1px solid #CCDCD5;border-radius:16px;padding:28px">
<h1 style="font-family:Georgia,serif;font-weight:normal;font-size:24px;line-height:1.25;margin:0 0 14px;color:#141414">${escape(c.heading)}</h1>
${c.paragraphs.map((p) => `<p style="font-size:15px;line-height:1.6;margin:0 0 12px;color:#4A4640">${escape(p)}</p>`).join("")}
${button}
</td></tr>
<tr><td style="padding:18px 4px;font-size:12px;line-height:1.6;color:#6E6A63">
RentPact will never ask you to pay rent outside the app. If anyone does, report them.<br>
<a href="${APP_URL}/settings/notifications" style="color:#337357">Choose which emails you get</a> · <a href="${APP_URL}" style="color:#337357">rentpact.homes</a>
</td></tr></table></td></tr></table></body></html>`;
}

function renderText(c: EmailContent): string {
  return [
    c.heading,
    "",
    ...c.paragraphs,
    ...(c.cta ? ["", `${c.cta.label}: ${APP_URL}${c.cta.path}`] : []),
    "",
    "RentPact will never ask you to pay rent outside the app.",
    `Choose which emails you get: ${APP_URL}/settings/notifications`,
  ].join("\n");
}

/** Sends one email. `category` makes it respect the recipient's notification switches. Never throws. */
export async function sendEmail(to: string, content: EmailContent, category?: NotificationCategory): Promise<void> {
  if (!emailConfigured()) return;
  const recipient = to.trim().toLowerCase();
  try {
    if (category && (await getPrefs(recipient))[category] === false) return;
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [recipient],
        reply_to: process.env.EMAIL_REPLY_TO || undefined,
        subject: content.subject,
        html: renderHtml(content),
        text: renderText(content),
        headers: { "List-Unsubscribe": `<${APP_URL}/settings/notifications>` },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error("Email send failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
  } catch (error) {
    console.error("Email send failed", error);
  }
}

/** The email for a lease or listing message, or null for ordinary chat (push covers that). */
export function emailForMessage(m: {
  type: string;
  text: string;
  leaseId: string | null;
}): { content: EmailContent; category: NotificationCategory } | null {
  if (!m.leaseId) return null;
  const lease = `/leases/${m.leaseId}`;
  const text = m.text.trim();

  if (m.type === "maintenance") {
    return {
      category: "maintenance",
      content: {
        subject: "A tenant reported an issue with your property",
        heading: "New issue reported",
        paragraphs: [text || "Your tenant reported an issue that needs your attention."],
        cta: { label: "Open the conversation", path: `/messages/${m.leaseId}` },
      },
    };
  }
  if (m.type === "payment-reminder") {
    return {
      category: "money",
      content: { subject: "Rent reminder", heading: "Rent reminder", paragraphs: [text], cta: { label: "Open lease", path: lease } },
    };
  }
  if (m.type !== "system") return null;

  if (/awaiting your signature/i.test(text)) {
    return {
      category: "lease",
      content: {
        subject: "You've been invited to sign a lease on RentPact",
        heading: "A tenant is waiting for your signature",
        paragraphs: [
          text,
          "The rent is already held safely in escrow. Review the terms and sign to start the lease. It releases to you on schedule.",
        ],
        cta: { label: "Review and sign", path: `${lease}/invite` },
      },
    };
  }
  if (/^lease signed/i.test(text)) {
    return {
      category: "lease",
      content: { subject: "Your lease is now active", heading: "Your lease is active", paragraphs: [text], cta: { label: "Open lease", path: lease } },
    };
  }
  if (/released|returned/i.test(text) && !/dispute/i.test(text)) {
    return {
      category: "money",
      content: { subject: "Rent released on RentPact", heading: "Money released", paragraphs: [text], cta: { label: "Open lease", path: lease } },
    };
  }
  if (/dispute|settlement|repair credit|arbiter|caution fee claim/i.test(text)) {
    return {
      category: "dispute",
      content: {
        subject: /^dispute raised/i.test(text) ? "A dispute was raised on your lease" : "Update on your lease dispute",
        heading: /^dispute raised/i.test(text) ? "A dispute was raised" : "Dispute update",
        paragraphs: [text, "While a dispute is open, the rent stays frozen in escrow until it's resolved."],
        cta: { label: "Open the dispute", path: `${lease}/dispute` },
      },
    };
  }
  return {
    category: "lease",
    content: { subject: "Update on your RentPact lease", heading: "Lease update", paragraphs: [text], cta: { label: "Open lease", path: lease } },
  };
}
