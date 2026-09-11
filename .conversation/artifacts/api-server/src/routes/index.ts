import { Router, type IRouter } from "express";
import healthRouter from "./health";
import platformRouter from "./platform";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(platformRouter);
router.use(authRouter);

export default router;
