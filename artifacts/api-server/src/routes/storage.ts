import { Router, type IRouter } from "express";
import { uploadFile, deleteFileById, deleteFileByUrl, getStorageStatus, createUploadAuth, getAccountUsage } from "../lib/imagekit";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ============================================================================
// التخزين السحابي — الرفع هنا فقط (المفاتيح تبقى في السيرفر ولا تصل للمتصفح)
// POST /api/teacher/upload   { file, fileName, folder?, accountId? }
// ============================================================================

const ALLOWED_FOLDERS = [
  "/ard-al-lughah/covers",
  "/ard-al-lughah/avatars",
  "/ard-al-lughah/lessons",
  "/ard-al-lughah/html",
  "/ard-al-lughah/bundles",
  "/ard-al-lughah/teacher",
  "/ard-al-lughah/books",
];

function sanitizeFolder(folder: unknown): string {
  const f = String(folder || "/ard-al-lughah/lessons");
  if (ALLOWED_FOLDERS.includes(f)) return f;
  if (f.startsWith("/ard-al-lughah/") && !f.includes("..")) return f;
  return "/ard-al-lughah/lessons";
}

router.get("/teacher/storage", requireAdmin, async (_req, res) => {
  try {
    res.json({ success: true, ...getStorageStatus() });
  } catch (err: any) {
    logger.error({ err }, "GET /teacher/storage failed");
    res.status(500).json({ error: "تعذر جلب حالة التخزين" });
  }
});

router.get("/teacher/upload-auth", requireAdmin, async (req, res) => {
  try {
    // توقيع رفع مباشر: المتصفح يرفع الملف الكبير إلى ImageKit مباشرة
    // فيتجاوز حد Vercel (~4.5MB) — مثالي لحزم المواقع ZIP/TAR حتى 100MB.
    const folder = sanitizeFolder((req.query as Record<string, string>).folder || "/ard-al-lughah/bundles");
    const auth = createUploadAuth(folder, (req.query as Record<string, string>).accountId);
    res.json({ success: true, ...auth });
  } catch (err: any) {
    logger.error({ err }, "GET /teacher/upload-auth failed");
    res.status(500).json({ error: err?.message || "تعذر تجهيز الرفع المباشر" });
  }
});

router.get("/teacher/storage-usage", requireAdmin, async (_req, res) => {
  try {
    // استهلاك التخزين عبر حسابات ImageKit (استشاري — قد لا تدعمه كل الخطط)
    const usage = await getAccountUsage();
    res.json({ success: true, usage });
  } catch (err: any) {
    logger.error({ err }, "GET /teacher/storage-usage failed");
    res.status(500).json({ error: "تعذر قراءة الاستهلاك" });
  }
});

router.post("/teacher/upload", requireAdmin, async (req, res) => {
  try {
    const { file, fileName, folder, accountId } = req.body || {};
    if (!file || typeof file !== "string") {
      res.status(400).json({ error: "ملف غير صالح للرفع" });
      return;
    }
    const result = await uploadFile(file, fileName || `upload-${Date.now()}`, sanitizeFolder(folder), accountId);
    res.json({ success: true, message: "تم الرفع إلى التخزين السحابي بنجاح!", ...result });
  } catch (err: any) {
    logger.error({ err }, "POST /teacher/upload failed");
    res.status(500).json({ error: err?.message || "تعذر رفع الملف" });
  }
});

router.delete("/teacher/upload", requireAdmin, async (req, res) => {
  try {
    const { fileId, accountId, url } = { ...req.query, ...req.body } as Record<string, string>;
    if (url) {
      await deleteFileByUrl(String(url));
    } else if (fileId) {
      await deleteFileById(String(fileId), accountId ? String(accountId) : undefined);
    } else {
      res.status(400).json({ error: "حدد fileId أو url لحذف الملف" });
      return;
    }
    res.json({ success: true, message: "تم حذف الملف من التخزين!" });
  } catch (err: any) {
    logger.error({ err }, "DELETE /teacher/upload failed");
    res.status(500).json({ error: err?.message || "تعذر حذف الملف" });
  }
});

export default router;
