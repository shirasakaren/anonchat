function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Shared card layout for every transactional email this app sends - plain,
 *  table-based, inline-styled (the only markup guaranteed to render
 *  consistently across mail clients), and deliberately never embeds the
 *  site avatar: it's a base64 data: URL that many clients (Gmail
 *  included) strip or refuse to render inline. */
function emailShell(params: { preheader: string; heading: string; bodyHtml: string; siteUrl: string }): string {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(params.preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 24px;">
                <h1 style="margin:0 0 16px;font-size:18px;line-height:1.4;color:#0a0a0a;">${escapeHtml(params.heading)}</h1>
                <div style="font-size:14px;line-height:1.6;color:#3a3f47;">${params.bodyHtml}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background-color:#f4f5f7;">
                <p style="margin:0;font-size:12px;color:#9aa0ac;">Sent by Anonchat on behalf of ${escapeHtml(params.siteUrl)}.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px;"><tr><td style="border-radius:8px;background-color:#4338ca;">
    <a href="${href}" style="display:inline-block;padding:11px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

export function replyNotificationEmail(params: { adminName: string; siteUrl: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const { adminName, siteUrl } = params;
  const bodyHtml = `<p style="margin:0 0 4px;">You have a new reply from <strong>${escapeHtml(adminName)}</strong> on ${escapeHtml(siteUrl)}.</p>
    <p style="margin:12px 0 0;color:#6b7280;">For your privacy, message content is end-to-end encrypted and never included in this email - open the conversation to read it.</p>
    ${button("Open conversation", siteUrl)}
    <p style="margin:20px 0 0;font-size:12px;color:#9aa0ac;">You're receiving this because you asked to be notified by email when there's a reply. This is a one-time-per-visit notice, not a recurring subscription.</p>`;
  return {
    subject: `New reply from ${adminName}`,
    html: emailShell({
      preheader: `${adminName} replied to your message.`,
      heading: "You have a new reply",
      bodyHtml,
      siteUrl,
    }),
    text: `You have a new reply from ${adminName} on ${siteUrl}.\n\nMessage content is end-to-end encrypted and isn't included here - open the conversation to read it:\n${siteUrl}`,
  };
}

export function adminDigestEmail(params: { messageCount: number; conversationCount: number; siteUrl: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const { messageCount, conversationCount, siteUrl } = params;
  const messageWord = messageCount === 1 ? "message" : "messages";
  const conversationWord = conversationCount === 1 ? "conversation" : "conversations";
  const adminUrl = `${siteUrl.replace(/\/$/, "")}/admin`;
  const bodyHtml = `<p style="margin:0;">You have <strong>${messageCount} new ${messageWord}</strong> across <strong>${conversationCount} ${conversationWord}</strong> on ${escapeHtml(siteUrl)}.</p>
    <p style="margin:12px 0 0;color:#6b7280;">Message content is end-to-end encrypted, so this summary can't include what was said - open the dashboard to read it.</p>
    ${button("Open dashboard", adminUrl)}`;
  return {
    subject: `${messageCount} new ${messageWord} on ${siteUrl}`,
    html: emailShell({
      preheader: `${messageCount} new ${messageWord} across ${conversationCount} ${conversationWord}.`,
      heading: "New messages waiting",
      bodyHtml,
      siteUrl,
    }),
    text: `You have ${messageCount} new ${messageWord} across ${conversationCount} ${conversationWord} on ${siteUrl}.\n\nOpen the dashboard: ${adminUrl}`,
  };
}
