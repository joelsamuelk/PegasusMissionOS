import type { PegasusEmailInput, RenderedEmail } from "./types";

const C = {
  navy: "#14213d",
  coral: "#ff5757",
  blue: "#4fa7e8",
  paper: "#fffaf7",
  muted: "#667085",
  line: "#e6e8ec",
};

export function escapeEmailHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]!,
  );
}

function safeUrl(value: string, allowMailto = false): string {
  const url = new URL(value);
  if (
    !(["https:", "http:", ...(allowMailto ? ["mailto:"] : [])] as string[]).includes(
      url.protocol,
    )
  )
    throw new Error("Email links must use HTTP or HTTPS (or an approved mailto link).");
  return escapeEmailHtml(url.toString());
}

function signatureHtml(s: NonNullable<PegasusEmailInput["signature"]>): string {
  const contact = [s.email, s.phone]
    .filter(Boolean)
    .map((v) => escapeEmailHtml(v!))
    .join(" &nbsp;·&nbsp; ");
  const place = [s.website, s.location]
    .filter(Boolean)
    .map((v) => escapeEmailHtml(v!))
    .join(" &nbsp;·&nbsp; ");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;background:${C.navy};border-radius:12px;color:#fff"><tr><td style="padding:24px;width:116px;border-right:2px solid ${C.coral};vertical-align:middle"><div style="font:700 20px Arial,sans-serif;color:${C.blue}">Pegasus<span style="color:${C.coral}">●</span></div><div style="margin-top:6px;font-size:38px;line-height:20px;color:${C.coral}">⌣</div></td><td style="padding:24px;vertical-align:middle"><div style="font:700 18px Arial,sans-serif">${escapeEmailHtml(s.name)}</div><div style="margin-top:3px;font:700 12px Arial,sans-serif;color:${C.coral}">${escapeEmailHtml(s.role)}${s.organisation ? ` · ${escapeEmailHtml(s.organisation)}` : ""}</div><div style="margin-top:15px;font:13px Arial,sans-serif;color:#e3e8f2">${contact}</div>${place ? `<div style="margin-top:8px;font:700 12px Arial,sans-serif;color:#a8c8ef">${place}</div>` : ""}</td></tr></table>`;
}

export function renderPegasusEmail(input: PegasusEmailInput): RenderedEmail {
  if (input.kind === "outreach" && !input.compliance)
    throw new Error("Outreach email requires compliance and unsubscribe details.");
  const sections = input.sections
    .map(
      (s) =>
        `${s.heading ? `<h2 style="margin:24px 0 8px;font:700 17px Arial,sans-serif;color:${C.navy}">${escapeEmailHtml(s.heading)}</h2>` : ""}${s.paragraphs.map((p) => `<p style="margin:0 0 14px;font:15px/1.65 Arial,sans-serif;color:${C.navy}">${escapeEmailHtml(p)}</p>`).join("")}${s.items?.length ? `<ul style="margin:8px 0 18px;padding-left:22px;color:${C.navy}">${s.items.map((i) => `<li style="margin:6px 0;font:15px/1.5 Arial,sans-serif">${escapeEmailHtml(i)}</li>`).join("")}</ul>` : ""}`,
    )
    .join("");
  const action = input.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0"><tr><td style="border-radius:7px;background:${C.navy}"><a href="${safeUrl(input.action.url)}" style="display:inline-block;padding:12px 20px;font:700 14px Arial,sans-serif;color:#fff;text-decoration:none">${escapeEmailHtml(input.action.label)}</a></td></tr></table>`
    : "";
  const compliance = input.compliance
    ? `<p style="margin:10px 0 0;font:11px/1.5 Arial,sans-serif;color:${C.muted}">${escapeEmailHtml(input.compliance.organisationName)}, ${escapeEmailHtml(input.compliance.postalAddress)}<br>${input.compliance.contactSource ? `${escapeEmailHtml(input.compliance.contactSource)}<br>` : ""}<a href="${safeUrl(input.compliance.unsubscribeUrl, true)}" style="color:${C.muted}">Unsubscribe from outreach</a></p>`
    : "";
  const signature =
    input.kind !== "transactional" && input.signature
      ? signatureHtml(input.signature)
      : "";
  const textSections = input.sections
    .flatMap((s) => [s.heading, ...s.paragraphs, ...(s.items ?? []).map((i) => `- ${i}`)])
    .filter(Boolean)
    .join("\n\n");
  const text = [
    input.preheader,
    input.greeting,
    input.title,
    textSections,
    input.action ? `${input.action.label}: ${input.action.url}` : undefined,
    input.closing,
    input.signature
      ? `${input.signature.name}\n${input.signature.role}\n${input.signature.email}${input.signature.phone ? ` · ${input.signature.phone}` : ""}`
      : undefined,
    input.compliance
      ? `${input.compliance.organisationName}\n${input.compliance.postalAddress}\nUnsubscribe: ${input.compliance.unsubscribeUrl}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    subject: input.subject,
    text,
    html: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeEmailHtml(input.subject)}</title></head><body style="margin:0;background:${C.paper}"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeEmailHtml(input.preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border:1px solid ${C.line};border-radius:14px;overflow:hidden"><tr><td style="padding:22px 30px;background:${C.navy}"><div style="font:700 21px Arial,sans-serif;color:${C.blue}">Pegasus <span style="color:${C.coral}">●⌣</span></div><div style="margin-top:4px;font:700 10px Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:#b8c3d9">Mission OS</div></td></tr><tr><td style="padding:34px 30px">${input.greeting ? `<p style="margin:0 0 12px;font:15px Arial,sans-serif;color:${C.muted}">${escapeEmailHtml(input.greeting)}</p>` : ""}<h1 style="margin:0 0 20px;font:700 28px/1.2 Arial,sans-serif;color:${C.navy}">${escapeEmailHtml(input.title)}</h1>${sections}${action}${input.closing ? `<p style="margin:22px 0 0;font:15px/1.6 Arial,sans-serif;color:${C.navy}">${escapeEmailHtml(input.closing)}</p>` : ""}${signature}</td></tr><tr><td style="padding:20px 30px;border-top:1px solid ${C.line};background:#fbfbfc"><p style="margin:0;font:11px/1.5 Arial,sans-serif;color:${C.muted}">Pegasus Information Studio · Exeter, Devon, UK<br>This message was sent by Pegasus Mission OS. Security-sensitive links expire and should not be forwarded.</p>${compliance}</td></tr></table></td></tr></table></body></html>`,
  };
}
