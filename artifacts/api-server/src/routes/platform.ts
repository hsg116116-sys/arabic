import { Router, type IRouter } from "express";
import {
  GetPlatformOverviewResponse,
  GetStudentDashboardResponse,
  GetTeacherDashboardResponse,
  GetTeacherSettingsResponse,
  ListAnnouncementsResponse,
  ListAssessmentsResponse,
  ListAssignmentsResponse,
  ListCoursesResponse,
  ListStudentsResponse,
  UpdateTeacherSettingsBody,
  UpdateTeacherSettingsResponse,
} from "@workspace/api-zod";
import {
  announcements,
  assessments,
  assignments,
  courses,
  platformOverview,
  platformSettings,
  studentDashboard,
  students,
  teacherDashboard,
} from "../lib/platform-data";

const router: IRouter = Router();

router.get("/platform/overview", (_req, res) => {
  res.json(GetPlatformOverviewResponse.parse(platformOverview));
});

router.get("/student/dashboard", (_req, res) => {
  res.json(GetStudentDashboardResponse.parse(studentDashboard));
});

router.get("/teacher/dashboard", (_req, res) => {
  res.json(GetTeacherDashboardResponse.parse(teacherDashboard));
});

router.get("/courses", (_req, res) => {
  res.json(ListCoursesResponse.parse(courses));
});

router.get("/assignments", (_req, res) => {
  res.json(ListAssignmentsResponse.parse(assignments));
});

router.get("/assessments", (_req, res) => {
  res.json(ListAssessmentsResponse.parse(assessments));
});

router.get("/announcements", (_req, res) => {
  res.json(ListAnnouncementsResponse.parse(announcements));
});

router.get("/teacher/settings", (_req, res) => {
  res.json(GetTeacherSettingsResponse.parse(platformSettings));
});

router.patch("/teacher/settings", (req, res) => {
  const parsed = UpdateTeacherSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  Object.assign(platformSettings, parsed.data);
  platformOverview.settings = platformSettings;
  platformOverview.platformName = platformSettings.platformName;
  platformOverview.teacherName = platformSettings.teacherName;
  res.json(UpdateTeacherSettingsResponse.parse(platformSettings));
});

router.get("/teacher/students", (_req, res) => {
  res.json(ListStudentsResponse.parse(students));
});

export default router;