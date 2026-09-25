import { Router, type IRouter } from "express";
import { uploadFile, deleteFileById, deleteFileByUrl, getStorageStatus } from "../lib/imagekit";
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
