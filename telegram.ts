import fs from "node:fs";
import path from "node:path";
import { decrypt } from "./crypto.js";

const API = "https://api.telegram.org";
const escapeHtml = (value: unknown) => String(value ?? "—")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

export async function getTelegramConfig(prisma: any) {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: ["telegramToken", "telegramChatId"] } } });
  const map = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
  return {
    token: map.telegramToken ? decrypt(map.telegramToken) : "",
    chatId: map.telegramChatId || ""
  };
}

export async function telegramRequest(token: string, method: string, body: any) {
  const response = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.description || `Telegram HTTP ${response.status}`);
  return data.result;
}

function formatPayload(payload: Record<string, any>) {
  return Object.entries(payload).map(([key, value]) => {
    if (["branch", "reportDate"].includes(key)) return "";
    if (value === undefined || value === null || value === "") return "";
    const rendered = typeof value === "object" ? JSON.stringify(value) : String(value);
    return `<b>${escapeHtml(key)}:</b> ${escapeHtml(rendered)}`;
  }).filter(Boolean).join("\n");
}

export async function sendReportToTelegram(prisma: any, report: any) {
  const { token, chatId } = await getTelegramConfig(prisma);
  if (!token || !chatId) throw new Error("أكمل Bot Token وChat ID من صفحة الإعدادات أولاً.");

  const typeNames: Record<string, string> = {
    sales: "تقرير المبيعات", expenses: "تقرير المصروفات", waste: "تقرير التالف والهدر",
    maintenance: "بلاغ صيانة", employees: "تقييم الموظفين"
  };
  const date = new Date(report.reportDate).toLocaleDateString("ar-SA");
  const message = [
    "📊 <b>رَصْد | تقرير تشغيل جديد</b>",
    `📌 <b>النوع:</b> ${escapeHtml(typeNames[report.type] || report.type)}`,
    `🏢 <b>الفرع:</b> ${escapeHtml(report.branch)}`,
    `📅 <b>التاريخ:</b> ${escapeHtml(date)}`,
    "",
    formatPayload(report.payload as Record<string, any>),
    "",
    `<i>رقم التقرير: ${escapeHtml(report.id)}</i>`
  ].filter(Boolean).join("\n");

  await telegramRequest(token, "sendMessage", { chat_id: chatId, text: message, parse_mode: "HTML" });

  const attachments = report.attachments || [];
  for (const attachment of attachments) {
    const filePath = path.resolve(process.cwd(), "uploads", attachment.storedName);
    if (!fs.existsSync(filePath)) throw new Error(`تعذر العثور على المرفق: ${attachment.fileName}`);
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", `مرفق التقرير ${report.id}: ${attachment.fileName}`);
    const blob = new Blob([fs.readFileSync(filePath)], { type: attachment.mimeType });
    form.append("photo", blob, attachment.fileName);
    const response = await fetch(`${API}/bot${token}/sendPhoto`, { method: "POST", body: form });
    const result: any = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.description || "فشل إرسال أحد المرفقات إلى Telegram.");
  }
}
