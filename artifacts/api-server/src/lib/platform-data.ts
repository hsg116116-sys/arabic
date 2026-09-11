import type {
  PlatformOverview,
  PlatformSettings,
  StudentDashboard,
  TeacherDashboard,
} from "@workspace/api-zod";

export const platformSettings: PlatformSettings = {
  platformName: "أرض اللغة",
  teacherName: "المعلم أحمد يحيى الأسطل",
  teacherBio:
    "أرافق طلابي في رحلة ممتعة لفهم العربية، وتطوير مهارات القراءة والكتابة والتفكير.",
  teacherImageUrl: "/teacher-ahmed.jpg",
  signatureUrl: "",
  accentColor: "#a85d3d",
};

export const courses = [
  {
    id: "course-1",
    title: "الوحدة الأولى · رحلة في النص",
    description: "نقرأ النصوص بوعي، ونكتشف المعنى خلف كل كلمة.",
    lessons: 8,
    duration: "3 ساعات",
    progress: 72,
    color: "terracotta",
    icon: "book-open",
  },
  {
    id: "course-2",
    title: "الوحدة الثانية · جمال التعبير",
    description: "نبني جملة قوية ونكتب أفكارنا بثقة ووضوح.",
    lessons: 6,
    duration: "2.5 ساعة",
    progress: 38,
    color: "teal",
    icon: "pen-line",
  },
  {
    id: "course-3",
    title: "الوحدة الثالثة · مفاتيح القواعد",
    description: "نرتب القاعدة في ذهننا لتصبح أداة سهلة في الكتابة.",
    lessons: 10,
    duration: "4 ساعات",
    progress: 15,
    color: "gold",
    icon: "sparkles",
  },
];

export const assignments = [
  {
    id: "assignment-1",
    title: "رسالة إلى صديق",
    description: "اكتب رسالة قصيرة تستخدم فيها أسلوب النداء والوصف.",
    unit: "الوحدة الأولى",
    dueDate: "2026-09-18",
    status: "قيد التنفيذ",
    points: 20,
  },
  {
    id: "assignment-2",
    title: "خريطة النص",
    description: "استخرج الفكرة الرئيسة والأفكار الداعمة من النص المقروء.",
    unit: "الوحدة الأولى",
    dueDate: "2026-09-21",
    status: "لم يبدأ",
    points: 15,
  },
  {
    id: "assignment-3",
    title: "دفتر المفردات",
    description: "اجمع عشر مفردات جديدة، واكتب معناها في جملة مفيدة.",
    unit: "الوحدة الثانية",
    dueDate: "2026-09-25",
    status: "تم التصحيح",
    points: 25,
  },
];

export const assessments = [
  {
    id: "assessment-1",
    title: "اختبار فهم المقروء",
    questions: 15,
    duration: "25 دقيقة",
    score: 88,
    status: "مكتمل",
    date: "2026-09-08",
  },
  {
    id: "assessment-2",
    title: "مراجعة الوحدة الأولى",
    questions: 20,
    duration: "30 دقيقة",
    score: 0,
    status: "متاح الآن",
    date: "2026-09-20",
  },
  {
    id: "assessment-3",
    title: "تحدي القواعد",
    questions: 12,
    duration: "20 دقيقة",
    score: 92,
    status: "مكتمل",
    date: "2026-08-29",
  },
];

export const announcements = [
  {
    id: "announcement-1",
    title: "موعد اختبار الوحدة الأولى",
    body: "سيكون الاختبار متاحًا يوم الأحد القادم، خصص وقتًا هادئًا للمراجعة.",
    date: "منذ ساعتين",
    type: "اختبار",
    audience: "الصف التاسع · طلاب",
  },
  {
    id: "announcement-2",
    title: "درس جديد في شرح الكتاب",
    body: "أضفت شرحًا مبسطًا لأسلوب النداء مع أمثلة وتدريبات قصيرة.",
    date: "أمس",
    type: "درس جديد",
    audience: "الجميع",
  },
  {
    id: "announcement-3",
    title: "تذكير بالتكليف",
    body: "لا تنسَ رفع مهمة رسالة إلى صديق قبل نهاية الأسبوع.",
    date: "منذ 3 أيام",
    type: "تذكير",
    audience: "الصف التاسع · طلاب",
  },
];

export const students = [
  {
    id: "student-1",
    name: "ليان محمد",
    email: "layan@example.com",
    school: "مدرسة وايلد",
    branch: "مدينتي",
    grade: "الصف التاسع",
    section: "أ",
    gender: "طالبة",
    progress: 78,
    status: "نشط",
    avatarUrl: "",
  },
  {
    id: "student-2",
    name: "يوسف خالد",
    email: "yousef@example.com",
    school: "مدرسة وايلد",
    branch: "مدينتي",
    grade: "الصف التاسع",
    section: "أ",
    gender: "طالب",
    progress: 64,
    status: "نشط",
    avatarUrl: "",
  },
  {
    id: "student-3",
    name: "نور أحمد",
    email: "noor@example.com",
    school: "مبادرة أهرامات الأمل",
    branch: "الشروق",
    grade: "الصف العاشر",
    section: "ب",
    gender: "طالبة",
    progress: 91,
    status: "نشط",
    avatarUrl: "",
  },
  {
    id: "student-4",
    name: "آدم سامر",
    email: "adam@example.com",
    school: "مدرسة وايلد",
    branch: "مدينتي",
    grade: "الصف التاسع",
    section: "ب",
    gender: "طالب",
    progress: 42,
    status: "يحتاج متابعة",
    avatarUrl: "",
  },
];

export const studentDashboard: StudentDashboard = {
  student: students[0],
  progress: 78,
  completedLessons: 18,
  nextUp: courses,
  announcements,
};

export const teacherDashboard: TeacherDashboard = {
  stats: {
    students: 128,
    activeStudents: 112,
    schools: 2,
    units: 12,
    assignments: 24,
    assessments: 9,
    averageScore: 84,
    certificates: 36,
  },
  weeklyActivity: [
    { label: "السبت", value: 48 },
    { label: "الأحد", value: 67 },
    { label: "الاثنين", value: 54 },
    { label: "الثلاثاء", value: 82 },
    { label: "الأربعاء", value: 74 },
    { label: "الخميس", value: 91 },
    { label: "الجمعة", value: 62 },
  ],
  recentStudents: students,
  pendingAssignments: assignments.filter((item) => item.status !== "تم التصحيح"),
};

export const platformOverview: PlatformOverview = {
  platformName: platformSettings.platformName,
  teacherName: platformSettings.teacherName,
  tagline: "نتعلّم العربية لنفهم العالم ونعبّر عن أنفسنا.",
  description:
    "بيئة تعليمية رقمية تجمع الدروس، الشروحات، التكليفات، الاختبارات، التقييمات والشهادات في مكان واحد.",
  stats: {
    students: 128,
    units: 12,
    assessments: 9,
    assignments: 24,
    certificates: 36,
  },
  settings: platformSettings,
};