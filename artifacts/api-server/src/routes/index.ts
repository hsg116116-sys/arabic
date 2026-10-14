import { Router, type IRouter } from "express";
import healthRouter from "./health";
import platformRouter from "./platform";
import curriculumRouter from "./curriculum";
import storageRouter from "./storage";
import studyRouter from "./study";
import authRouter from "./auth";
import foundationRouter from "./foundation";
import organizationRouter from "./organization";
import reportRouter from "./report";
import cloudinaryRouter from "./cloudinary";

const router: IRouter = Router();

router.use(healthRouter);
router.use(platformRouter);
router.use(curriculumRouter);
router.use(storageRouter);
router.use(studyRouter);
router.use(authRouter);
router.use(foundationRouter);
router.use(organizationRouter);
router.use(reportRouter);
router.use(cloudinaryRouter);

export default router;
