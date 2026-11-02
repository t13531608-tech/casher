import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { encrypt } from "./crypto.js";
import { getTelegramConfig, sendReportToTelegram, telegramRequest } from "./telegram.js";

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT || 4000);
const uploadDir = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));

const maxMb = Number(process.env.MAX_UPLOAD_MB || 8);
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({
  storage, limits: { fileSize: maxMb * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype))
});

const safeReport = (r: any) => ({
  ...r,
  attachments: r.attachments?.map((a: any) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, size: a.size })),
  attempts: r.attempts || []
});

async function sendAndLog(reportId: string) {
  const report = await prisma.report.findUnique({ where: { id: reportId }, include: { attachments: true } });
  if (!report) throw new Error("التقرير غير موجود.");
  try {
    await sendReportToTelegram(prisma, report);
    await prisma.$transaction([
      prisma.report.update({ where: { id: reportId }, data: { telegramStatus: "SENT" } }),
      prisma.sendAttempt.create({ data: { reportId, status: "SENT", message: "تم الإرسال بنجاح." } })
    ]);
    return { status: "SENT" };
  } catch (error: any) {
    const message = String(error?.message || "تعذر الإرسال").slice(0, 500);
    await prisma.$transaction([
      prisma.report.update({ where: { id: reportId }, data: { telegramStatus: "FAILED" } }),
      prisma.sendAttempt.create({ data: { reportId, status: "FAILED", message } })
    ]);
    return { status: "FAILED", message };
  }
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/dashboard", async (_req, res, next) => {
  try {
    const [totalReports, sales, openMaintenance, wasteReports, latest] = await Promise.all([
      prisma.report.count(),
      prisma.report.findMany({ where: { type: "sales" }, select: { payload: true } }),
      prisma.report.count({ where: { type: "maintenance", payload: { path: ["status"], not: "مكتمل" } } }),
      prisma.report.findMany({ where: { type: "waste" }, select: { payload: true } }),
      prisma.report.findMany({ take: 6, orderBy: { createdAt: "desc" }, include: { attachments: true, attempts: { orderBy: { attemptedAt: "desc" }, take: 1 } } })
    ]);
    const totalSales = sales.reduce((sum, r: any) => sum + Number(r.payload?.totalSales || 0), 0);
    const totalWaste = wasteReports.reduce((sum, r: any) => sum + Number(r.payload?.loss || 0), 0);
    const config = await getTelegramConfig(prisma).catch(() => ({ token: "", chatId: "" }));
    res.json({ totalReports, totalSales, openMaintenance, totalWaste, telegramConfigured: Boolean(config.token && config.chatId), latest: latest.map(safeReport) });
  } catch (e) { next(e); }
});

app.get("/api/reports", async (req, res, next) => {
  try {
    const q = String(req.query.q || "");
    const type = String(req.query.type || "");
    const where: any = {};
    if (type && type !== "all") where.type = type;
    if (q) where.OR = [{ branch: { contains: q, mode: "insensitive" } }, { id: { contains: q, mode: "insensitive" } }];
    const reports = await prisma.report.findMany({ where, orderBy: { createdAt: "desc" }, include: { attachments: true, attempts: { orderBy: { attemptedAt: "desc" } } } });
    res.json(reports.map(safeReport));
  } catch (e) { next(e); }
});

app.get("/api/reports/:id", async (req, res, next) => {
  try {
    const report = await prisma.report.findUnique({ where: { id: req.params.id }, include: { attachments: true, attempts: { orderBy: { attemptedAt: "desc" } } } });
    if (!report) return res.status(404).json({ error: "التقرير غير موجود." });
    res.json(safeReport(report));
  } catch (e) { next(e); }
});

app.post("/api/reports", upload.array("attachments", 5), async (req, res, next) => {
  const uploaded = (req.files as Express.Multer.File[] || []);
  try {
    const { type, branch, reportDate, payload } = req.body;
    if (!["sales", "expenses", "waste", "maintenance", "employees"].includes(type)) return res.status(400).json({ error: "نوع التقرير غير صحيح." });
    if (!String(branch || "").trim()) return res.status(400).json({ error: "اسم الفرع مطلوب." });
    if (!reportDate || Number.isNaN(Date.parse(reportDate))) return res.status(400).json({ error: "تاريخ التقرير غير صحيح." });
    let parsed: any;
    try { parsed = JSON.parse(payload || "{}"); } catch { return res.status(400).json({ error: "بيانات التقرير غير صالحة." }); }
    if (type === "sales" && (Number(parsed.totalSales) < 0 || Number(parsed.cashSales) < 0 || Number(parsed.electronicSales) < 0)) return res.status(400).json({ error: "قيم المبيعات لا يمكن أن تكون سالبة." });
    if (type === "waste") parsed.loss = Number(parsed.quantity || 0) * Number(parsed.unitCost || 0);

    const report = await prisma.report.create({
      data: {
        type, branch: String(branch).trim(), reportDate: new Date(reportDate), payload: parsed,
        attachments: { create: uploaded.map(f => ({ fileName: f.originalname, storedName: f.filename, mimeType: f.mimetype, size: f.size })) }
      },
      include: { attachments: true, attempts: true }
    });
    const delivery = await sendAndLog(report.id);
    const result = await prisma.report.findUnique({ where: { id: report.id }, include: { attachments: true, attempts: { orderBy: { attemptedAt: "desc" } } } });
    res.status(201).json({ report: safeReport(result), delivery });
  } catch (e) {
    for (const f of uploaded) fs.existsSync(f.path) && fs.unlinkSync(f.path);
    next(e);
  }
});

app.post("/api/reports/:id/resend", async (req, res, next) => {
  try {
    const delivery = await sendAndLog(req.params.id);
    const report = await prisma.report.findUnique({ where: { id: req.params.id }, include: { attachments: true, attempts: { orderBy: { attemptedAt: "desc" } } } });
    res.json({ report: report ? safeReport(report) : null, delivery });
  } catch (e) { next(e); }
});

app.get("/api/attachments/:id", async (req, res, next) => {
  try {
    const file = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!file) return res.status(404).json({ error: "المرفق غير موجود." });
    res.download(path.join(uploadDir, file.storedName), file.fileName);
  } catch (e) { next(e); }
});

app.get("/api/settings/telegram", async (_req, res, next) => {
  try {
    const config = await getTelegramConfig(prisma);
    res.json({ configured: Boolean(config.token && config.chatId), chatId: config.chatId, tokenMasked: config.token ? "••••••••••••" : "" });
  } catch (e) { next(e); }
});

app.put("/api/settings/telegram", async (req, res, next) => {
  try {
    const { token, chatId } = req.body || {};
    if (!String(chatId || "").trim()) return res.status(400).json({ error: "Chat ID مطلوب." });
    const writes: any[] = [prisma.appSetting.upsert({ where: { key: "telegramChatId" }, update: { value: String(chatId).trim() }, create: { key: "telegramChatId", value: String(chatId).trim() } })];
    if (String(token || "").trim()) {
      writes.push(prisma.appSetting.upsert({ where: { key: "telegramToken" }, update: { value: encrypt(String(token).trim()) }, create: { key: "telegramToken", value: encrypt(String(token).trim()) } }));
    }
    await prisma.$transaction(writes);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post("/api/settings/telegram/test", async (_req, res, next) => {
  try {
    const config = await getTelegramConfig(prisma);
    if (!config.token || !config.chatId) return res.status(400).json({ error: "أدخل Bot Token وChat ID أولاً." });
    await telegramRequest(config.token, "sendMessage", { chat_id: config.chatId, text: "✅ <b>رَصْد</b>\nتم اختبار الاتصال بنجاح.", parse_mode: "HTML" });
    res.json({ ok: true });
  } catch (e: any) { res.status(502).json({ error: e.message || "فشل اختبار الاتصال." }); }
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (err instanceof multer.MulterError) return res.status(400).json({ error: "تعذر رفع الملف. تأكد من أن الصورة ضمن الحجم المسموح." });
  res.status(500).json({ error: err?.message || "حدث خطأ داخلي." });
});

app.listen(port, () => console.log(`RASD API running on http://localhost:${port}`));
