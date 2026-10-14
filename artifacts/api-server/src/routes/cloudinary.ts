import { Router, type IRouter } from "express";
import {
  createVideoUploadAuth,
  getCloudinaryAccounts,
  getCloudinaryStatus,
  markCloudinaryDown,
  pickCloudinaryAccount,
} from "../lib/cloudinary";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ============================================================================
// فيديوهات الدروس — Cloudinary بحسابين وتناوب تلقائي.
// المتصفح يرفع الملف مباشرة إلى Cloudinary (يتجاوز حدود Vercel)، والسيرفر
// يعطيه توقيعاً مؤقتاً فقط — السر لا يغادر الخادم أبداً.
// ============================================================================

/** توقيع رفع: المتصفح يرفع به الفيديو مباشرة (حتى الملفات الكبيرة بالمقاطع) */
router.get("/teacher/cloudinary/sign", requireAdmin, async (req, res) => {
  try {
    const q = (req.query || {}) as Record<string, string>;
    const auth = await createVideoUploadAuth(q.filename || q.name);
    res.json({ success: true, ...auth });
  } catch (err: any) {
    logger.error({ err }, "GET cloudinary sign failed");
    res.status(503).json({ error: err?.message || "تعذر تجهيز الرفع — راجع حسابي Cloudinary" });
  }
});

/** حالة الحسابين: أيهما نشط وكم بقي من حصته — تُعرض للأستاذ قبل الرفع */
router.get("/teacher/cloudinary/status", requireAdmin, async (_req, res) => {
  try {
    const status = await getCloudinaryStatus();
    res.json({ success: true, ...status });
  } catch (err: any) {
    logger.error({ err }, "GET cloudinary status failed");
    res.status(500).json({ error: "تعذر قراءة حالة التخزين" });
  }
});

/** فشل الرفع على حساب من المتصفح: نسقطه دقائق ونعطي توقيع الحساب الآخر فوراً */
router.post("/teacher/cloudinary/failover", requireAdmin, async (req, res) => {
  try {
    const b = (req.body || {}) as Record<string, unknown>;
    const accounts = getCloudinaryAccounts();
    const failedIndex = Number(b.failedIndex);
    const failedCloud = String(b.failedCloud || "").trim();
    const hit = accounts.find((a) =>
      (Number.isFinite(failedIndex) && failedIndex > 0 && a.index === failedIndex) ||
      (failedCloud && a.cloud === failedCloud),
    );
    if (hit) markCloudinaryDown(hit.index, 10);

    const next = await pickCloudinaryAccount();
    if (!next) {
      res.status(503).json({ error: "الحسابان ساقطان الآن — حاول بعد دقائق" });
      return;
    }
    const q = (req.query || {}) as Record<string, string>;
    const auth = await createVideoUploadAuth(typeof b.filename === "string" ? b.filename : q.filename);
    res.json({ success: true, switched: !!hit, ...auth });
  } catch (err: any) {
    logger.error({ err }, "POST cloudinary failover failed");
    res.status(503).json({ error: err?.message || "تعذر التبديل للحساب الآخر" });
  }
});

export default router;
