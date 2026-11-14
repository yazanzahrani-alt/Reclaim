'use strict';

// ============================================================================
// Reclaim — frontend
// All permissions are enforced by the server; this file only renders what the
// server allows the signed-in user to see.
// ============================================================================

// Local dev: frontend on :3000 talks to the backend on :5000. When deployed, /api is same-origin.
const API_BASE = window.location.port === '3000'
  ? `${window.location.protocol}//${window.location.hostname}:5000/api`
  : '/api';

const TOKEN_KEY = 'reclaim_token';

let token = localStorage.getItem(TOKEN_KEY) || '';
let currentUser = null;
let meta = { categories: [], colors: [], locations: [] };
let stats = null;
let overview = null;
let allReports = [];
let allMatches = [];
let allClaims = [];
let userNotifications = [];
let authMode = 'signin'; // 'signin' | 'register'

// Photo state (data URLs). `thumb` is a tiny preview used for privacy blur.
const photos = {
  report: { url: '', thumb: '', kb: 0 },
  claim: { url: '', thumb: '', kb: 0 },
  more: { url: '', thumb: '', kb: 0 }
};

// ---------------------------------------------------------------------------
// Internationalization (Formal Arabic & Formal English) and Theme Management
// ---------------------------------------------------------------------------
let currentLang = localStorage.getItem('reclaim_lang') || 'en';
let currentTheme = localStorage.getItem('reclaim_theme') || 'dark';

const CATEGORY_MAP = {
  'Electronics': 'إلكترونيات وأجهزة',
  'ID & Cards': 'بطاقات وهويات',
  'Bottles & Accessories': 'أوعية وإكسسوارات',
  'Books & Notes': 'كتب ومذكرات',
  'Keys & Wallets': 'مفاتيح ومحافظ',
  'Clothing': 'ملابس ومقتنيات شخصية',
  'Other': 'أخرى'
};

const COLOR_MAP = {
  'Black': 'أسود',
  'White': 'أبيض',
  'Gray': 'رمادي',
  'Silver': 'فضي',
  'Blue': 'أزرق',
  'Red': 'أحمر',
  'Green': 'أخضر',
  'Yellow': 'أصفر',
  'Orange': 'برتقالي',
  'Purple': 'بنفسجي',
  'Pink': 'وردي',
  'Brown': 'بني',
  'Gold': 'ذهبي',
  'Multicolor': 'متعدد الألوان'
};

const LOCATION_MAP = {
  'Engineering Building': 'مبنى كلية الهندسة',
  'Main Library': 'المكتبة المركزية',
  'Student Center': 'مركز الأنشطة الطلابية',
  'Science Complex': 'مجمع كليات العلوم',
  'Cafeteria': 'المطعم الجامعي / الكافتيريا',
  'Sports Hall': 'الصالة الرياضية',
  'Other Campus Area': 'موقع آخر بالحرم الجامعي'
};

const STATUS_MAP = {
  'Active': 'نشط',
  'Claim Pending': 'مطالبة قيد الإجراء',
  'Approved': 'معتمد للتسليم',
  'Returned': 'تم التسليم بنجاح',
  'Resolved': 'مغلق',
  'Pending': 'قيد المراجعة',
  'More Proof Requested': 'مطلوب إثبات إضافي',
  'Hold Item': 'موقوف لدى الإدارة',
  'Dismissed': 'مرفوض'
};

const I18N = {
  en: {
    pageTitle: 'Al-Baha University — Lost & Found',
    brandBadge: 'AL-BAHA UNIVERSITY • LOST & FOUND',
    campusTag: 'AL-BAHA UNI',
    heroTitle: 'Report what you lost or found at Al-Baha University. Reclaim matches reports automatically and returns items only after an administrator verifies ownership.',
    feature1Title: 'Automatic matching',
    feature1Desc: 'New reports are compared with existing ones by category, building, color, brand and keywords.',
    feature2Title: 'Privacy first',
    feature2Desc: "Photos of found items stay hidden from other students, and nobody's identity is exposed.",
    feature3Title: 'Verified handover',
    feature3Desc: 'Every claim is checked by an administrator before the item is released.',
    loginTitleSignIn: 'Sign in to Reclaim',
    loginSubtitleSignIn: 'Enter your username and password. New here? Type a new username and we\'ll help you create the account.',
    loginTitleRegister: 'Create your account',
    loginSubtitleRegister: 'Choose a password and confirm it. Your account is created the moment you submit.',
    usernameLabel: 'Username',
    passwordLabel: 'Password',
    confirmPasswordLabel: 'Confirm password',
    show: 'Show',
    hide: 'Hide',
    ruleLength: 'At least 8 characters',
    ruleNumber: 'At least one number',
    ruleSpecial: 'At least one special character (! @ # $ % …)',
    ruleMatch: 'Both passwords match',
    signInBtn: 'Sign in',
    registerTabBtn: 'Register',
    createAccountBtn: 'Register',
    backToSignIn: '← Back to sign in',
    filterDate: 'Date',
    fieldPhotoRequired: 'Photo * (required for found items, max 3 MB)',
    fieldHandoverRequired: 'I am handing the physical item to the Campus Lost & Found office. *',
    btnDetails: '🔍 View Details',
    btnEdit: '✏️ Edit',
    editReportTitle: 'Edit report',
    editReportSub: 'Update your report details and re-run automatic matching.',
    saveChanges: 'Save changes',
    closeBtn: 'Close',
    errFoundPhotoRequired: 'A photo is required when reporting a found item.',
    errAdminNoLost: 'Administrators cannot report lost items.',
    navHome: '🏠 Home',
    navBrowse: '🔍 Search & Browse',
    navReport: '➕ Report Item',
    navClaims: '📋 Matches & Claims',
    navAdmin: '🛡️ Admin Workspace',
    signOut: 'Sign Out',
    roleStudent: '👤 User',
    roleAdmin: '🛡️ Administrator',
    welcomeHeadline: (u) => `Welcome, ${u}`,
    homeCampusPill: '🎓 Al-Baha University — Lost & Found',
    homeSubtitle: "Lost something, or found something at Al-Baha University? Report it in under a minute. Reclaim compares it with every open report and notifies the owner if there's a match.",
    btnReportLost: '📢 Report Lost Item',
    btnReportFound: '📦 Report Found Item',
    btnSearchCampus: '🔎 Search Campus Items',
    statReports: 'Open Reports',
    statMatches: 'Suggested Matches',
    statSpeed: 'Last Match Time',
    statResolved: 'Items Returned',
    sectionSuggestedMatches: '⚡ Suggested Matches',
    sectionSuggestedMatchesSub: 'Found items that look like something you reported lost.',
    sectionRecentReports: '📍 Recent Reports',
    sectionRecentReportsSub: 'Photos of found items are hidden from other students to prevent false claims.',
    viewAll: 'View all →',
    searchAndFilter: 'Search & filter →',
    browseTitle: '🔍 Search & Filter',
    browseSubtitle: 'Search every open lost and found report on campus.',
    filterKeyword: 'Keyword',
    filterKeywordPlaceholder: 'Charger, calculator, bottle, Dell…',
    filterType: 'Type',
    filterTypeAll: 'Lost & Found',
    filterTypeFound: 'Found only',
    filterTypeLost: 'Lost only',
    filterCategory: 'Category',
    filterCategoryAll: 'All categories',
    filterLocation: 'Building',
    filterLocationAll: 'All buildings',
    filterColor: 'Color',
    filterColorAll: 'All colors',
    filterReset: 'Reset',
    tabLost: '📢 Report a Lost Item',
    tabLostSub: 'I lost something on campus',
    tabFound: '📦 Report a Found Item',
    tabFoundSub: 'I found something and will hand it in',
    bannerLost: '📢 You will be notified the instant a matching found item is reported.',
    bannerFound: '🔒 For privacy and security, photos of found items stay blurred for other students until claimed.',
    fieldTitle: 'Item title *',
    fieldTitlePlaceholder: 'e.g. Black laptop charger',
    fieldCategory: 'Category *',
    fieldColor: 'Main color *',
    fieldBrand: 'Brand / make',
    fieldBrandPlaceholder: 'e.g. Dell, Apple, Casio',
    fieldLocation: 'Campus building / location *',
    fieldDate: 'When *',
    fieldDescription: 'Description *',
    fieldDescriptionPlaceholder: 'Where and how was it lost or found? (at least 10 characters)',
    fieldMarks: 'Distinguishing marks (serial number, stickers, scratches)',
    fieldMarksPlaceholder: 'Only the owner and administrators can see this on found items',
    fieldHandover: 'I am handing the physical item to the Campus Lost & Found office.',
    fieldPhoto: 'Photo (optional, compressed automatically; max 3 MB)',
    btnRemovePhoto: 'Remove photo',
    btnSubmitReport: 'Submit report →',
    claimMatchesTitle: '⚡ Suggested Matches',
    claimMatchesSub: 'Submit an ownership claim on any found item that matches something you lost.',
    myClaimsTitle: '📋 My Ownership Claims',
    myClaimsSub: 'Pending → (More proof requested) → Approved → Confirm receipt → Returned.',
    adminTitle: 'Administrator Workspace',
    adminSub: 'Review ownership claims side by side with the unblurred found item, request more proof, complete handovers and moderate flagged reports.',
    btnDevOps: '⚡ Open DevOps Console',
    adminClaimsHeading: '1. Ownership claims',
    adminFlaggedHeading: '2. Flagged reports',
    notificationsTitle: '🔔 Notifications',
    markAllRead: 'Mark all read',
    devopsTitle: '⚡ DevOps & Administrator Console',
    devopsSub: 'Review claims, moderate reports, inspect users and system logs, and manage the database.',
    devopsClose: '✕ Close',
    devopsTabClaims: '🛡️ Ownership claims',
    devopsTabMod: '🚨 Flagged reports',
    devopsTabTelemetry: '📊 System & database',
    devopsDangerTitle: 'Danger zone',
    devopsDangerDesc: 'Permanently deletes every report, match, claim, notification, log entry and every account except admin.',
    devopsWipeBtn: '🗑️ Wipe all data'
  },
  ar: {
    pageTitle: 'جامعة الباحة — نظام المفقودات والمعثورات',
    brandBadge: 'جامعة الباحة • المفقودات والمعثورات',
    campusTag: 'جامعة الباحة',
    heroTitle: 'أبلغ عما فقدته أو وجدته داخل جامعة الباحة. يقوم النظام بمطابقة البلاغات آلياً ولا يتم تسليم المقتنيات إلا بعد التحقق الإداري من الملكية.',
    feature1Title: 'مطابقة آلية ذكية',
    feature1Desc: 'تتم مقارنة البلاغات الجديدة آلياً مع الموجودات حسب التصنيف والمبنى واللون والعلامات المميزة.',
    feature2Title: 'حماية الخصوصية أولاً',
    feature2Desc: 'تظل صور المعثورات وبيانات الملتقط محجوبة عن بقية الطلاب لمنع ادعاءات الملكية الباطلة.',
    feature3Title: 'تسليم موثق ومعتمد',
    feature3Desc: 'تُدقق جميع مطالبات الملكية من قبل إدارة الأمانات قبل اعتماد تسليم أي مقتنى.',
    loginTitleSignIn: 'تسجيل الدخول إلى ريكليم',
    loginSubtitleSignIn: 'أدخل اسم المستخدم وكلمة المرور. مستخدم جديد؟ اكتب اسم مستخدم جديد وسنساعدك في إنشاء حسابك فوراً.',
    loginTitleRegister: 'إنشاء حساب جديد',
    loginSubtitleRegister: 'اختر كلمة مرور مطابقة للمعايير وأكّدها ليتم إنشاء حسابك فوراً.',
    usernameLabel: 'اسم المستخدم',
    passwordLabel: 'كلمة المرور',
    confirmPasswordLabel: 'تأكيد كلمة المرور',
    show: 'إظهار',
    hide: 'إخفاء',
    ruleLength: '8 أحرف على الأقل',
    ruleNumber: 'رقم واحد على الأقل',
    ruleSpecial: 'رمز خاص واحد على الأقل (! @ # $ % …)',
    ruleMatch: 'تطابق كلمتي المرور',
    signInBtn: 'تسجيل الدخول',
    registerTabBtn: 'إنشاء حساب',
    createAccountBtn: 'إنشاء الحساب',
    backToSignIn: '→ العودة إلى تسجيل الدخول',
    filterDate: 'التاريخ',
    fieldPhotoRequired: 'صورة المعثور عليه * (إجبارية لبلاغات المعثورات، بحد أقصى 3 ميجابايت)',
    fieldHandoverRequired: 'أقر بتسليم المقتنى فعلياً إلى مكتب المفقودات والمعثورات بجامعة الباحة. *',
    btnDetails: '🔍 عرض التفاصيل',
    btnEdit: '✏️ تعديل',
    editReportTitle: 'تعديل البلاغ',
    editReportSub: 'حدّث بيانات بلاغك لإعادة المطابقة الآلية.',
    saveChanges: 'حفظ التعديلات',
    closeBtn: 'إغلاق',
    errFoundPhotoRequired: 'إرفاق صورة للمعثور عليه إجباري.',
    errAdminNoLost: 'لا يمكن لمسؤول النظام الإبلاغ عن مفقودات.',
    navHome: '🏠 الرئيسية',
    navBrowse: '🔍 البحث والتصفح',
    navReport: '➕ تقديم بلاغ',
    navClaims: '📋 المطابقات والمطالبات',
    navAdmin: '🛡️ مساحة الإدارة',
    signOut: 'تسجيل الخروج',
    roleStudent: '👤 مستخدم',
    roleAdmin: '🛡️ مسؤول النظام',
    welcomeHeadline: (u) => `أهلاً بك، ${u}`,
    homeCampusPill: '🎓 جامعة الباحة — المفقودات والمعثورات',
    homeSubtitle: 'أضعت مقتنى، أو عثرت على ما ليس لك في جامعة الباحة؟ أبلغ عنه الآن. يتولى النظام مطابقة البلاغات وإشعار المالك فور وجود تطابق.',
    btnReportLost: '📢 الإبلاغ عن مفقود',
    btnReportFound: '📦 الإبلاغ عن معثور عليه',
    btnSearchCampus: '🔎 تصفح مقتنيات الحرم',
    statReports: 'البلاغات المفتوحة',
    statMatches: 'المطابقات المقترحة',
    statSpeed: 'سرعة آخر مطابقة',
    statResolved: 'المقتنيات المستردة',
    sectionSuggestedMatches: '⚡ المطابقات المقترحة',
    sectionSuggestedMatchesSub: 'معثورات تطابق مواصفات ما أبلغت عن فقده.',
    sectionRecentReports: '📍 أحدث البلاغات',
    sectionRecentReportsSub: 'صور المعثورات محجوبة عن الطلاب لحماية الأمانات ومنع الادعاءات الكاذبة.',
    viewAll: 'عرض الكل ←',
    searchAndFilter: 'البحث والتصفية ←',
    browseTitle: '🔍 البحث والتصفية',
    browseSubtitle: 'ابحث في جميع بلاغات المفقودات والموجودات داخل الحرم الجامعي.',
    filterKeyword: 'الكلمة المفتاحية',
    filterKeywordPlaceholder: 'شاحن، حاسبة، محفظة، ديل…',
    filterType: 'النوع',
    filterTypeAll: 'المفقودات والمعثورات',
    filterTypeFound: 'المعثورات فقط',
    filterTypeLost: 'المفقودات فقط',
    filterCategory: 'التصنيف',
    filterCategoryAll: 'جميع التصنيفات',
    filterLocation: 'المبنى',
    filterLocationAll: 'جميع المباني',
    filterColor: 'اللون',
    filterColorAll: 'جميع الألوان',
    filterReset: 'إعادة ضبط',
    tabLost: '📢 الإبلاغ عن مفقود',
    tabLostSub: 'أضعت مقتنى شخصياً داخل الحرم الجامعي',
    tabFound: '📦 الإبلاغ عن معثور عليه',
    tabFoundSub: 'عثرت على مقتنى وسأقوم بتسليمه للمكتب',
    bannerLost: '📢 سيتم إشعارك فور تسجيل أي معثور عليه تتطابق مواصفاته مع مفقودك.',
    bannerFound: '🔒 لحماية الأمانات، لن تظهر الصورة للطلاب الآخرين وسيتعين على المدعي إثبات ملكيته.',
    fieldTitle: 'عنوان المقتنى *',
    fieldTitlePlaceholder: 'مثال: شاحن حاسوب محمول أسود',
    fieldCategory: 'التصنيف *',
    fieldColor: 'اللون الأساسي *',
    fieldBrand: 'العلامة التجارية / الصانع',
    fieldBrandPlaceholder: 'مثال: ديل، آبل، كاسيو',
    fieldLocation: 'المبنى الجامعي / الموقع *',
    fieldDate: 'تاريخ ووقت الفقد أو العثور *',
    fieldDescription: 'الوصف التفصيلي *',
    fieldDescriptionPlaceholder: 'أين وكيف فُقد أو وُجد المقتنى؟ (10 أحرف على الأقل)',
    fieldMarks: 'العلامات الفارقة (الرقم التسلسلي، ملصقات، خدوش)',
    fieldMarksPlaceholder: 'لا يطّلع على هذا الحقل سوى المالك الحقيقي والإدارة في المعثورات',
    fieldHandover: 'أقرّ بأنني قمت بتسليم المقتنى عيناً إلى مكتب الأمانات والمفقودات بالجامعة.',
    fieldPhoto: 'صورة المقتنى (اختيارية، تُضغط تلقائياً - حد أقصى 3 ميجابايت)',
    btnRemovePhoto: 'حذف الصورة',
    btnSubmitReport: 'إرسال البلاغ ←',
    claimMatchesTitle: '⚡ المطابقات المقترحة',
    claimMatchesSub: 'قدّم مطالبة ملكية لأي مقتنى معثور عليه يطابق ما فقدته.',
    myClaimsTitle: '📋 مطالبات إثبات الملكية الخاصة بي',
    myClaimsSub: 'قيد المراجعة ← (طُلب إثبات إضافي) ← معتمدة ← تأكيد الاستلام ← تم التسليم.',
    adminTitle: 'مساحة عمل إدارة الأمانات',
    adminSub: 'مراجعة مطالبات الملكية مع صورة المعثور عليه غير المحجوبة، وطلب أدلة إضافية، واعتماد التسليم، ومتابعة البلاغات المبلغ عنها.',
    btnDevOps: '⚡ فتح وحدة تحكم DevOps',
    adminClaimsHeading: '1. مطالبات الملكية',
    adminFlaggedHeading: '2. البلاغات المبلغ عنها',
    notificationsTitle: '🔔 التنبيهات',
    markAllRead: 'تحديد الكل كمقروء',
    devopsTitle: '⚡ وحدة تحكم DevOps وإدارة النظام',
    devopsSub: 'مراجعة المطالبات، ومراقبة العمليات الحية، وفحص المستخدمين وسجلات النظام وإدارة قاعدة البيانات.',
    devopsClose: '✕ إغلاق',
    devopsTabClaims: '🛡️ مطالبات الملكية',
    devopsTabMod: '🚨 البلاغات المبلغ عنها',
    devopsTabTelemetry: '📊 حالة النظام وقاعدة البيانات',
    devopsDangerTitle: 'منطقة الإجراءات الحاسمة',
    devopsDangerDesc: 'حذف جميع البلاغات والمطالبات والمطابقات والتنبيهات وجميع الحسابات نهائياً عدا حساب المسؤول admin.',
    devopsWipeBtn: '🗑️ مسح وإعادة ضبط البيانات'
  }
};

function t(key, ...args) {
  const dict = I18N[currentLang] || I18N.en;
  const val = dict[key] ?? (I18N.en[key] ?? key);
  return typeof val === 'function' ? val(...args) : val;
}

function setTheme(theme) {
  currentTheme = theme;
  localStorage.setItem('reclaim_theme', theme);
  document.documentElement.setAttribute('data-theme', theme);

  const icon = theme === 'dark' ? '☀️' : '🌙';
  const title = theme === 'dark'
    ? (currentLang === 'ar' ? 'التبديل إلى الوضع النهاري' : 'Switch to Light Mode')
    : (currentLang === 'ar' ? 'التبديل إلى الوضع الليلي' : 'Switch to Dark Mode');

  if ($('login-theme-btn')) { $('login-theme-btn').textContent = icon; $('login-theme-btn').title = title; }
  if ($('nav-theme-btn')) { $('nav-theme-btn').textContent = icon; $('nav-theme-btn').title = title; }
}

function toggleTheme() {
  setTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

let isTogglingLang = false;
function toggleLanguage(e) {
  if (e && typeof e.stopPropagation === 'function') {
    e.stopPropagation();
    e.preventDefault();
  }
  if (isTogglingLang) return;
  isTogglingLang = true;
  try {
    const nextLang = currentLang === 'ar' ? 'en' : 'ar';
    setLanguage(nextLang);
  } finally {
    setTimeout(() => { isTogglingLang = false; }, 200);
  }
}

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('reclaim_lang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

  const langText = currentLang === 'ar' ? '🌐 English' : '🌐 العربية';
  if ($('login-lang-btn')) $('login-lang-btn').textContent = langText;
  if ($('nav-lang-btn')) $('nav-lang-btn').textContent = langText;
  if ($('home-lang-btn')) $('home-lang-btn').textContent = langText;

  setTheme(currentTheme);

  try {
    updateStaticI18n();
  } catch (err) {
    console.warn('updateStaticI18n error:', err);
  }

  try {
    if (meta && meta.categories && meta.categories.length) {
      fillSelect('filter-category', meta.categories, t('filterCategoryAll'), CATEGORY_MAP);
      fillSelect('filter-location', meta.locations, t('filterLocationAll'), LOCATION_MAP);
      fillSelect('filter-color', meta.colors, t('filterColorAll'), COLOR_MAP);
      fillSelect('rep-category', meta.categories, '', CATEGORY_MAP);
      fillSelect('rep-color', meta.colors, '', COLOR_MAP);
      fillSelect('rep-location', meta.locations, '', LOCATION_MAP);
      fillSelect('edit-category', meta.categories, '', CATEGORY_MAP);
      fillSelect('edit-color', meta.colors, '', COLOR_MAP);
      fillSelect('edit-location', meta.locations, '', LOCATION_MAP);
    }
  } catch (err) {
    console.warn('fillSelect error:', err);
  }

  if (currentUser) {
    try { updateUserHeader(); } catch (e) { console.warn(e); }
    try { renderStatsAndBadges(); } catch (e) { console.warn(e); }
    try { renderHomeView(); } catch (e) { console.warn(e); }
    try { applySearchFilters(); } catch (e) { console.warn(e); }
    try { renderClaimsAndMatchesView(); } catch (e) { console.warn(e); }
    try { renderAdminWorkspaceView(); } catch (e) { console.warn(e); }
    try { renderNotificationsDrawer(); } catch (e) { console.warn(e); }
    try { renderDevOpsConsole(); } catch (e) { console.warn(e); }
  }
}

function updateStaticI18n() {
  document.title = t('pageTitle');
  // Login Hero
  const brandBadge = document.querySelector('.brand-badge span:last-child');
  if (brandBadge) brandBadge.textContent = t('brandBadge');
  const heroSub = document.querySelector('.hero-subtitle');
  if (heroSub) heroSub.textContent = t('heroTitle');

  const featureItems = document.querySelectorAll('.hero-feature-item');
  if (featureItems.length >= 3) {
    featureItems[0].querySelector('h4').textContent = t('feature1Title');
    featureItems[0].querySelector('p').textContent = t('feature1Desc');
    featureItems[1].querySelector('h4').textContent = t('feature2Title');
    featureItems[1].querySelector('p').textContent = t('feature2Desc');
    featureItems[2].querySelector('h4').textContent = t('feature3Title');
    featureItems[2].querySelector('p').textContent = t('feature3Desc');
  }

  // Login Form
  if ($('btn-mode-signin')) $('btn-mode-signin').textContent = t('signInBtn');
  if ($('btn-mode-register')) $('btn-mode-register').textContent = t('registerTabBtn');
  $('login-title').textContent = authMode === 'register' ? t('loginTitleRegister') : t('loginTitleSignIn');
  $('login-subtitle').textContent = authMode === 'register' ? t('loginSubtitleRegister') : t('loginSubtitleSignIn');
  const userLabel = document.querySelector('label[for="login-username"]');
  if (userLabel) userLabel.textContent = t('usernameLabel');
  const passLabel = document.querySelector('label[for="login-password"]');
  if (passLabel) passLabel.textContent = t('passwordLabel');
  const confLabel = document.querySelector('label[for="login-confirm"]');
  if (confLabel) confLabel.textContent = t('confirmPasswordLabel');
  $('login-submit').textContent = authMode === 'register' ? t('createAccountBtn') : t('signInBtn');
  $('login-back').textContent = t('backToSignIn');
  $('toggle-password').textContent = $('login-password').type === 'password' ? t('show') : t('hide');

  updatePasswordRules();

  // Navbar
  const campusTag = document.querySelector('.campus-tag');
  if (campusTag) campusTag.textContent = t('campusTag');
  const navBtns = document.querySelectorAll('.main-nav .nav-btn');
  if (navBtns.length >= 5) {
    navBtns[0].childNodes[0].nodeValue = t('navHome') + ' ';
    navBtns[1].childNodes[0].nodeValue = t('navBrowse') + ' ';
    navBtns[2].childNodes[0].nodeValue = t('navReport') + ' ';
    navBtns[3].childNodes[0].nodeValue = t('navClaims') + ' ';
    navBtns[4].childNodes[0].nodeValue = t('navAdmin') + ' ';
  }
  const signOutBtn = document.querySelector('.nav-right .btn-outline');
  if (signOutBtn) signOutBtn.textContent = t('signOut');

  // Home Hero Banner
  if ($('home-campus-pill')) $('home-campus-pill').textContent = t('homeCampusPill');
  const homeP = $('home-subtitle') || document.querySelector('.hero-banner-text p');
  if (homeP) homeP.textContent = t('homeSubtitle');
  if ($('home-report-lost-btn')) $('home-report-lost-btn').textContent = t('btnReportLost');
  if ($('home-report-found-btn')) $('home-report-found-btn').textContent = t('btnReportFound');
  if ($('home-browse-btn')) $('home-browse-btn').textContent = t('btnSearchCampus');
  if ($('home-lang-btn')) $('home-lang-btn').textContent = currentLang === 'ar' ? '🌐 English' : '🌐 العربية';
  const statLabels = document.querySelectorAll('.stat-card .stat-label');
  if (statLabels.length >= 4) {
    statLabels[0].textContent = t('statReports');
    statLabels[1].textContent = t('statMatches');
    statLabels[2].textContent = t('statSpeed');
    statLabels[3].textContent = t('statResolved');
  }

  // Home Sections
  const homeSecHeaders = document.querySelectorAll('#view-home .section-header');
  if (homeSecHeaders.length >= 2) {
    homeSecHeaders[0].querySelector('h2').textContent = t('sectionSuggestedMatches');
    homeSecHeaders[0].querySelector('p').textContent = t('sectionSuggestedMatchesSub');
    homeSecHeaders[0].querySelector('button').textContent = t('viewAll');
    homeSecHeaders[1].querySelector('h2').textContent = t('sectionRecentReports');
    homeSecHeaders[1].querySelector('p').textContent = t('sectionRecentReportsSub');
    homeSecHeaders[1].querySelector('button').textContent = t('searchAndFilter');
  }

  // Browse View
  const browseHeader = document.querySelector('#view-browse .page-title-bar');
  if (browseHeader) {
    browseHeader.querySelector('h2').textContent = t('browseTitle');
    browseHeader.querySelector('p').textContent = t('browseSubtitle');
  }
  const browseButtons = document.querySelectorAll('#view-browse .page-title-actions button');
  if (browseButtons.length >= 2) {
    browseButtons[0].textContent = t('btnReportLost');
    browseButtons[1].textContent = t('btnReportFound');
  }
  const filterGroups = document.querySelectorAll('.filter-bar .filter-group label');
  if (filterGroups.length >= 6) {
    filterGroups[0].textContent = t('filterKeyword');
    filterGroups[1].textContent = t('filterType');
    filterGroups[2].textContent = t('filterCategory');
    filterGroups[3].textContent = t('filterLocation');
    filterGroups[4].textContent = t('filterColor');
    filterGroups[5].textContent = t('filterDate');
  }
  $('filter-q').placeholder = t('filterKeywordPlaceholder');
  const filterTypeSelect = $('filter-type');
  if (filterTypeSelect && filterTypeSelect.options.length >= 3) {
    filterTypeSelect.options[0].text = t('filterTypeAll');
    filterTypeSelect.options[1].text = t('filterTypeFound');
    filterTypeSelect.options[2].text = t('filterTypeLost');
  }
  const resetBtn = document.querySelector('.filter-reset button');
  if (resetBtn) resetBtn.textContent = t('filterReset');

  // Report View
  const tabLostBtn = $('tab-btn-lost');
  if (tabLostBtn) {
    tabLostBtn.childNodes[0].nodeValue = t('tabLost') + ' ';
    const sub = tabLostBtn.querySelector('span');
    if (sub) sub.textContent = t('tabLostSub');
  }
  const tabFoundBtn = $('tab-btn-found');
  if (tabFoundBtn) {
    tabFoundBtn.childNodes[0].nodeValue = t('tabFound') + ' ';
    const sub = tabFoundBtn.querySelector('span');
    if (sub) sub.textContent = t('tabFoundSub');
  }
  const repLabels = document.querySelectorAll('#create-report-form .form-group label');
  if (repLabels.length >= 7) {
    repLabels[0].textContent = t('fieldTitle');
    repLabels[1].textContent = t('fieldCategory');
    repLabels[2].textContent = t('fieldColor');
    repLabels[3].textContent = t('fieldBrand');
    repLabels[4].textContent = t('fieldLocation');
    repLabels[5].textContent = t('fieldDate');
    repLabels[6].textContent = t('fieldDescription');
  }
  $('rep-title').placeholder = t('fieldTitlePlaceholder');
  $('rep-brand').placeholder = t('fieldBrandPlaceholder');
  $('rep-description').placeholder = t('fieldDescriptionPlaceholder');
  const repMarksLabel = document.querySelector('label[for="rep-marks"]');
  if (repMarksLabel) repMarksLabel.textContent = t('fieldMarks');
  $('rep-marks').placeholder = t('fieldMarksPlaceholder');
  const handedSpan = document.querySelector('#found-handover-box .checkbox-label span');
  if (handedSpan) handedSpan.textContent = t('fieldHandoverRequired');
  const repPhotoLabel = $('rep-photo-label');
  if (repPhotoLabel) {
    const isFoundForm = $('report-type-input') && $('report-type-input').value === 'FOUND';
    repPhotoLabel.textContent = isFoundForm ? t('fieldPhotoRequired') : t('fieldPhoto');
  }
  const repClearBtn = document.querySelector('#create-report-form .btn-chip');
  if (repClearBtn) repClearBtn.textContent = t('btnRemovePhoto');
  $('report-submit').textContent = t('btnSubmitReport');

  // Claims View
  const claimsSecHeaders = document.querySelectorAll('#view-claims .section-header');
  if (claimsSecHeaders.length >= 2) {
    claimsSecHeaders[0].querySelector('h2').textContent = t('claimMatchesTitle');
    claimsSecHeaders[0].querySelector('p').textContent = t('claimMatchesSub');
    claimsSecHeaders[1].querySelector('h2').textContent = t('myClaimsTitle');
    claimsSecHeaders[1].querySelector('p').textContent = t('myClaimsSub');
  }

  // Admin View
  const adminBanner = document.querySelector('.admin-workspace-banner');
  if (adminBanner) {
    const pill = adminBanner.querySelector('.admin-pill');
    if (pill) pill.textContent = t('roleAdmin');
    const h2 = adminBanner.querySelector('h2');
    if (h2) h2.textContent = t('adminTitle');
    const p = adminBanner.querySelector('p');
    if (p) p.textContent = t('adminSub');
    const devBtn = adminBanner.querySelector('.btn-devops-trigger');
    if (devBtn) devBtn.textContent = t('btnDevOps');
  }
  const adminHeadings = document.querySelectorAll('#view-admin h3');
  if (adminHeadings.length >= 2) {
    adminHeadings[0].textContent = t('adminClaimsHeading');
    adminHeadings[1].textContent = t('adminFlaggedHeading');
  }

  // Modals & Drawers
  const notifHeader = document.querySelector('.notif-drawer-header h3');
  if (notifHeader) notifHeader.textContent = t('notificationsTitle');
  const notifMarkAll = document.querySelector('.notif-header-actions .btn-link');
  if (notifMarkAll) notifMarkAll.textContent = t('markAllRead');

  const devopsTitleGroup = document.querySelector('.devops-title-group');
  if (devopsTitleGroup) {
    const chip = devopsTitleGroup.querySelector('.devops-chip');
    if (chip) chip.textContent = t('roleAdmin');
    const h2 = devopsTitleGroup.querySelector('h2');
    if (h2) h2.textContent = t('devopsTitle');
    const p = devopsTitleGroup.querySelector('p');
    if (p) p.textContent = t('devopsSub');
  }
  const devopsClose = document.querySelector('.devops-close-btn');
  if (devopsClose) devopsClose.textContent = t('devopsClose');

  const devopsDanger = document.querySelector('.telemetry-card.danger-zone');
  if (devopsDanger) {
    const h4 = devopsDanger.querySelector('h4');
    if (h4) h4.textContent = t('devopsDangerTitle');
    const p = devopsDanger.querySelector('p');
    if (p) p.innerHTML = t('devopsDangerDesc');
    const wipeBtn = $('devops-wipe-btn');
    if (wipeBtn) wipeBtn.textContent = t('devopsWipeBtn');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message, kind = 'info') {
  const container = $('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast${kind === 'error' ? ' toast-error' : ''}`;
  toast.textContent = message; // textContent: never interprets HTML
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4800);
}

function formatWhen(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value ?? '');
  const locale = currentLang === 'ar' ? 'ar-SA' : 'en-US';
  return d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

async function api(path, { method = 'GET', body, auth = true } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new Error(currentLang === 'ar' ? 'تعذر الاتصال بالخادم. تأكد من تشغيل الخلفية (npm run dev:backend).' : 'Cannot reach the server. Make sure the backend is running (npm run dev:backend).');
  }

  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }

  if (res.status === 401 && auth && token) {
    const expiredMsg = currentLang === 'ar' ? 'انتهت صلاحية جلستك. يرجى تسجيل الدخول مجدداً.' : 'Your session has expired. Please sign in again.';
    forceSignedOut(expiredMsg);
    throw new Error(expiredMsg);
  }
  if (!res.ok) {
    const err = new Error(data.error || (currentLang === 'ar' ? 'فشل تنفيذ الطلب.' : 'Request failed.'));
    err.code = data.code;
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', async () => {
  $('login-form').addEventListener('submit', handleAuthSubmit);
  $('login-back').addEventListener('click', () => setAuthMode('signin'));
  $('toggle-password').addEventListener('click', togglePasswordVisibility);
  ['login-password', 'login-confirm'].forEach((id) => $(id).addEventListener('input', updatePasswordRules));
  $('login-username').addEventListener('input', () => {
    if (authMode === 'register') return;
    hide($('login-error'));
  });
  $('create-report-form').addEventListener('submit', handleCreateReportSubmit);
  if ($('edit-report-form')) $('edit-report-form').addEventListener('submit', handleEditReportSubmit);
  $('submit-claim-form').addEventListener('submit', handleSubmitClaim);
  $('more-proof-form').addEventListener('submit', handleMoreProofSubmit);
  document.addEventListener('click', handleDelegatedClick);

  // Theme & Language toggles
  const loginTheme = $('login-theme-btn');
  if (loginTheme) loginTheme.addEventListener('click', toggleTheme);
  const navTheme = $('nav-theme-btn');
  if (navTheme) navTheme.addEventListener('click', toggleTheme);

  const loginLang = $('login-lang-btn');
  if (loginLang) loginLang.addEventListener('click', toggleLanguage);
  const navLang = $('nav-lang-btn');
  if (navLang) navLang.addEventListener('click', toggleLanguage);
  const homeLang = $('home-lang-btn');
  if (homeLang) homeLang.addEventListener('click', toggleLanguage);

  setTheme(currentTheme);
  setLanguage(currentLang);

  try {
    meta = await api('/meta', { auth: false });
    fillSelect('filter-category', meta.categories, t('filterCategoryAll'), CATEGORY_MAP);
    fillSelect('filter-location', meta.locations, t('filterLocationAll'), LOCATION_MAP);
    fillSelect('filter-color', meta.colors, t('filterColorAll'), COLOR_MAP);
    fillSelect('rep-category', meta.categories, '', CATEGORY_MAP);
    fillSelect('rep-color', meta.colors, '', COLOR_MAP);
    fillSelect('rep-location', meta.locations, '', LOCATION_MAP);
    fillSelect('edit-category', meta.categories, '', CATEGORY_MAP);
    fillSelect('edit-color', meta.colors, '', COLOR_MAP);
    fillSelect('edit-location', meta.locations, '', LOCATION_MAP);
  } catch (err) {
    showLoginError(err.message);
  }

  resetReportForm();

  if (token) {
    try {
      const data = await api('/auth/me');
      currentUser = data.user;
      await enterAppShell();
    } catch {
      forceSignedOut();
    }
  }

  // Keep data fresh in real time without disturbing anything the user is typing.
  setInterval(() => {
    if (!currentUser || document.hidden) return;
    const el = document.activeElement;
    if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
    refreshAllData();
  }, 3000);
  window.addEventListener('focus', () => {
    if (currentUser) refreshAllData();
  });
});

function fillSelect(id, values, allLabel, map = null) {
  const select = $(id);
  if (!select) return;
  const options = allLabel ? [`<option value="ALL">${escapeHtml(allLabel)}</option>`] : [];
  (values || []).forEach((v) => {
    const label = (currentLang === 'ar' && map && map[v]) ? map[v] : v;
    options.push(`<option value="${escapeHtml(v)}">${escapeHtml(label)}</option>`);
  });
  select.innerHTML = options.join('');
}

const hide = (el) => el.classList.add('hidden');
const show = (el) => el.classList.remove('hidden');

// ---------------------------------------------------------------------------
// Sign in / create account
// ---------------------------------------------------------------------------
function showLoginError(message) {
  const box = $('login-error');
  box.textContent = message;
  show(box);
}

function togglePasswordVisibility() {
  const input = $('login-password');
  const confirm = $('login-confirm');
  const reveal = input.type === 'password';
  input.type = reveal ? 'text' : 'password';
  confirm.type = reveal ? 'text' : 'password';
  $('toggle-password').textContent = reveal ? t('hide') : t('show');
}

function setAuthMode(mode, notice = '') {
  authMode = mode;
  const register = mode === 'register';
  if ($('btn-mode-signin')) $('btn-mode-signin').classList.toggle('active', !register);
  if ($('btn-mode-register')) $('btn-mode-register').classList.toggle('active', register);
  $('register-extra').classList.toggle('hidden', !register);
  $('login-back').classList.toggle('hidden', !register);
  $('login-title').textContent = register ? t('loginTitleRegister') : t('loginTitleSignIn');
  $('login-subtitle').textContent = register
    ? t('loginSubtitleRegister')
    : t('loginSubtitleSignIn');
  $('login-submit').textContent = register ? t('createAccountBtn') : t('signInBtn');
  $('login-password').autocomplete = register ? 'new-password' : 'current-password';
  $('login-username').readOnly = false;
  $('login-back').textContent = t('backToSignIn');
  hide($('login-error'));
  const noticeBox = $('login-notice');
  if (notice) { noticeBox.textContent = notice; show(noticeBox); } else { hide(noticeBox); }
  if (register) {
    $('login-confirm').value = '';
    updatePasswordRules();
    if ($('login-username').value.trim()) {
      $('login-password').focus();
    } else {
      $('login-username').focus();
    }
  } else {
    $('login-password').value = '';
    $('login-confirm').value = '';
    $('login-username').focus();
  }
}

function passwordChecks(password, confirm) {
  return {
    length: password.length >= 8,
    number: /\d/.test(password),
    special: /[^A-Za-z0-9\s]/.test(password),
    match: password.length > 0 && password === confirm
  };
}

function updatePasswordRules() {
  const checks = passwordChecks($('login-password').value, $('login-confirm').value);
  document.querySelectorAll('#pw-rules .pw-rule').forEach((li) => {
    const ok = checks[li.dataset.rule];
    li.classList.toggle('ok', ok);
    const ruleKey = li.dataset.rule;
    const ruleLabel = ruleKey === 'length' ? t('ruleLength')
      : ruleKey === 'number' ? t('ruleNumber')
      : ruleKey === 'special' ? t('ruleSpecial')
      : t('ruleMatch');
    li.innerHTML = `<span class="pw-rule-mark">${ok ? '✓' : '○'}</span> ${escapeHtml(ruleLabel)}`;
  });
  return checks;
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  hide($('login-error'));

  const username = $('login-username').value.trim();
  const password = $('login-password').value;
  const submit = $('login-submit');

  if (!username) return showLoginError('Enter a username.');
  if (!password) return showLoginError('Enter a password.');

  submit.disabled = true;
  try {
    let data;
    if (authMode === 'register') {
      const checks = updatePasswordRules();
      if (!checks.length || !checks.number || !checks.special) {
        throw new Error('Your password must have at least 8 characters, one number and one special character.');
      }
      if (!checks.match) throw new Error('The two passwords do not match.');
      data = await api('/auth/register', {
        method: 'POST',
        auth: false,
        body: { username, password, confirmPassword: $('login-confirm').value }
      });
    } else {
      data = await api('/auth/login', { method: 'POST', auth: false, body: { username, password } });
    }

    token = data.token;
    localStorage.setItem(TOKEN_KEY, token);
    currentUser = data.user;
    $('login-password').value = '';
    $('login-confirm').value = '';
    setAuthMode('signin');
    showToast(data.isNewAccount ? `Account created. Welcome, ${currentUser.username}!` : `Welcome back, ${currentUser.username}.`);
    await enterAppShell();
  } catch (err) {
    if (err.code === 'USER_NOT_FOUND' && authMode === 'signin') {
      setAuthMode('register', `"${username}" is a new username. Confirm your password below to create the account.`);
      return;
    }
    showLoginError(err.message);
  } finally {
    submit.disabled = false;
  }
}

function resetAppState() {
  currentUser = null;
  stats = null;
  overview = null;
  allReports = [];
  allMatches = [];
  allClaims = [];
  userNotifications = [];
}

function forceSignedOut(message = '') {
  token = '';
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('reclaim_user'); // legacy key from the old prototype
  resetAppState();
  hide($('app-shell'));
  hide($('devops-floating-btn'));
  hide($('devops-overlay'));
  show($('login-screen'));
  setAuthMode('signin');
  if (message) showLoginError(message);
}

async function handleLogout() {
  try { await api('/auth/logout', { method: 'POST', body: {} }); } catch { /* already signed out */ }
  forceSignedOut();
  showToast('You have been signed out.');
}

async function enterAppShell() {
  hide($('login-screen'));
  show($('app-shell'));
  updateUserHeader();
  await refreshAllData();

  if (!currentUser) return;

  const isAdmin = currentUser.role === 'admin';
  $('devops-floating-btn').classList.toggle('hidden', !isAdmin);
  if (isAdmin) {
    switchView('admin');
    toggleDevOpsModal(true); // administrators land directly in the DevOps console
  } else {
    hide($('devops-overlay'));
    switchView('home');
  }
}

function updateUserHeader() {
  if (!currentUser) return;
  const isAdmin = currentUser.role === 'admin';
  $('header-user-avatar').textContent = (currentUser.username || 'U').charAt(0).toUpperCase();
  $('header-username').textContent = `@${currentUser.username}`;
  $('header-user-role').textContent = isAdmin ? t('roleAdmin') : t('roleStudent');
  $('nav-admin-tab').classList.toggle('hidden', !isAdmin);
  if ($('nav-report-tab')) $('nav-report-tab').classList.toggle('hidden', isAdmin);
  if ($('home-report-lost-btn')) $('home-report-lost-btn').classList.toggle('hidden', isAdmin);
  if ($('home-report-found-btn')) $('home-report-found-btn').classList.toggle('hidden', isAdmin);
  if ($('browse-report-lost-btn')) $('browse-report-lost-btn').classList.toggle('hidden', isAdmin);
  if ($('browse-report-found-btn')) $('browse-report-found-btn').classList.toggle('hidden', isAdmin);
  if ($('tab-btn-lost')) $('tab-btn-lost').classList.toggle('hidden', isAdmin);
  $('welcome-headline').textContent = t('welcomeHeadline', currentUser.username);
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
async function refreshAllData() {
  if (!currentUser) return;
  try {
    const isAdmin = currentUser.role === 'admin';
    const [statsRes, reportsRes, matchesRes, claimsRes, notifsRes, overviewRes] = await Promise.all([
      api('/stats'),
      api('/reports'),
      api('/matches'),
      api('/claims'),
      api('/notifications'),
      isAdmin ? api('/admin/overview') : Promise.resolve(null)
    ]);
    if (!currentUser) return;
    stats = statsRes;
    allReports = (reportsRes && reportsRes.reports) || [];
    allMatches = (matchesRes && matchesRes.matches) || [];
    allClaims = (claimsRes && claimsRes.claims) || [];
    userNotifications = (notifsRes && notifsRes.notifications) || [];
    overview = overviewRes;

    renderStatsAndBadges();
    renderHomeView();
    applySearchFilters();
    renderClaimsAndMatchesView();
    renderAdminWorkspaceView();
    renderNotificationsDrawer();
    renderDevOpsConsole();
  } catch (err) {
    if (currentUser) showToast(err.message, 'error');
  }
}

function renderStatsAndBadges() {
  if (!stats || !currentUser) return;
  $('stat-total-reports').textContent = stats.counts.reports;
  $('stat-total-matches').textContent = stats.counts.matches;
  $('stat-match-speed').textContent = stats.lastMatchLatencyMs === null ? '—' : `${stats.lastMatchLatencyMs} ms`;
  $('stat-resolved-cases').textContent = stats.counts.resolved;

  const unread = userNotifications.filter((n) => !n.is_read).length;
  $('notif-unread-badge').textContent = unread;
  $('notif-unread-badge').classList.toggle('hidden', unread === 0);

  const adminTotal = stats.counts.pendingClaims + stats.counts.flagged;
  $('nav-admin-badge').textContent = adminTotal;
  $('devops-fab-badge').textContent = adminTotal;
  $('devops-fab-badge').classList.toggle('hidden', adminTotal === 0);

  const mine = allClaims.filter((c) => c.claimant_id === currentUser.id).length;
  const navClaims = mine + (currentUser.role === 'admin' ? 0 : allMatches.length);
  $('nav-claims-badge').textContent = navClaims;
  $('nav-claims-badge').classList.toggle('hidden', navClaims === 0);
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
function switchView(name) {
  document.querySelectorAll('.view-section').forEach((el) => hide(el));
  const target = $(`view-${name}`);
  if (target) show(target);
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === name));
}

function openReportForm(type) {
  if (currentUser && currentUser.role === 'admin') {
    showToast(currentLang === 'ar' ? 'لا يمكن لمسؤول النظام تقديم بلاغات مفقودات أو معثورات.' : 'Administrators cannot report lost or found items.', 'error');
    return switchView('admin');
  }
  switchView('report');
  setReportFormType(type);
}

// ---------------------------------------------------------------------------
// Rendering: matches & reports
// ---------------------------------------------------------------------------
function emptyState(text) {
  return `<div class="alert-box">${escapeHtml(text)}</div>`;
}

function buildMatchCardHtml(m) {
  const isAr = currentLang === 'ar';
  const tags = (m.matched_attributes || []).map((tag) => {
    let text = tag;
    if (isAr) {
      text = tag
        .replace(/^Category:\s*(.+)$/, (_, c) => `التصنيف: ${CATEGORY_MAP[c] || c}`)
        .replace(/^Location:\s*(.+)$/, (_, l) => `الموقع: ${LOCATION_MAP[l] || l}`)
        .replace(/^Color:\s*(.+)$/, (_, col) => `اللون: ${COLOR_MAP[col] || col}`)
        .replace(/^Brand:\s*(.+)$/, (_, b) => `العلامة: ${b}`)
        .replace(/^Keywords:\s*(.+)$/, (_, k) => `كلمات مشتركة: ${k}`);
    }
    return `<span class="match-attr-tag">✓ ${escapeHtml(text)}</span>`;
  }).join('');

  const isAdmin = currentUser && currentUser.role === 'admin';
  const closed = ['Returned', 'Resolved'].includes(m.found_status);
  const canClaimMatch = !isAdmin && ['Active', 'Claim Pending'].includes(m.found_status);
  let action = '';
  if (closed) {
    action = `<span class="btn btn-sm" style="background:#d1fae5;color:#047857;">✅ ${escapeHtml(isAr ? 'تم التسليم' : 'Returned')}</span>`;
  } else if (isAdmin) {
    action = `<button class="btn btn-outline btn-sm" onclick="switchView('admin')">🛡️ ${escapeHtml(isAr ? 'مراجعة في مساحة الإدارة' : 'Review in Admin Workspace')}</button>`;
  } else if (canClaimMatch) {
    action = `<button class="btn btn-primary btn-sm" data-action="claim" data-id="${m.found_report_id}" data-lost="${m.lost_report_id}">🛡️ ${escapeHtml(isAr ? 'تقديم مطالبة إثبات ملكية' : 'Submit ownership claim')}</button>`;
  } else {
    action = `<span class="btn btn-sm" style="background:#dbeafe;color:#1d4ed8;">🛡️ ${escapeHtml(isAr ? (STATUS_MAP[m.found_status] || m.found_status) : m.found_status)}</span>`;
  }

  const scoreLabel = isAr ? 'نسبة تطابق' : 'match';
  const speedLabel = isAr ? `المطابقة في ${m.match_time_ms} مللي ثانية` : `Matched in ${m.match_time_ms} ms`;
  const lostHeader = isAr ? `📢 بلاغ مفقود #${m.lost_report_id}` : `📢 Lost report #${m.lost_report_id}`;
  const foundHeader = isAr ? `📦 بلاغ معثور عليه #${m.found_report_id}` : `📦 Found report #${m.found_report_id}`;
  const statusLabel = isAr ? (STATUS_MAP[m.found_status] || m.found_status) : m.found_status;

  const lostLoc = isAr ? (LOCATION_MAP[m.lost_location] || m.lost_location) : m.lost_location;
  const lostCol = isAr ? (COLOR_MAP[m.lost_color] || m.lost_color) : m.lost_color;
  const foundLoc = isAr ? (LOCATION_MAP[m.found_location] || m.found_location) : m.found_location;
  const foundCol = isAr ? (COLOR_MAP[m.found_color] || m.found_color) : m.found_color;

  return `
    <div class="match-card">
      <div class="match-header">
        <span class="match-score-pill">⚡ ${m.score}% ${scoreLabel}</span>
        <span class="match-speed-tag">${speedLabel}</span>
      </div>
      <div class="match-compare-row">
        <div class="match-side">
          <span class="match-side-title" style="color:#dc2626;">${lostHeader}</span>
          <strong>${escapeHtml(m.lost_title)}</strong>
          <div style="font-size:12px;margin-top:4px;">📍 ${escapeHtml(lostLoc)} • ${escapeHtml(lostCol)} • ${escapeHtml(m.lost_brand || (isAr ? 'بدون علامة' : 'No brand'))}</div>
        </div>
        <div class="match-side">
          <span class="match-side-title" style="color:#059669;">${foundHeader}</span>
          <strong>${escapeHtml(m.found_title)}</strong>
          <div style="font-size:12px;margin-top:4px;">📍 ${escapeHtml(foundLoc)} • ${escapeHtml(foundCol)}</div>
        </div>
      </div>
      <div class="match-tags-row">${tags}</div>
      <div class="match-footer">
        <span style="font-size:12px;color:var(--text-light);">${isAr ? 'الحالة:' : 'Status:'} <strong>${escapeHtml(statusLabel)}</strong></span>
        <div style="display:flex;gap:8px;">${action}</div>
      </div>
    </div>`;
}

function buildReportCardHtml(r) {
  const isAr = currentLang === 'ar';
  const photo = r.photo_url
    ? `<img src="${escapeHtml(r.photo_url)}" alt="" />`
    : `<div class="no-photo">${escapeHtml(isAr ? 'لا توجد صورة' : 'No photo')}</div>`;
  const overlay = r.should_blur_photo
    ? `<div class="privacy-blur-overlay">
         <span class="privacy-blur-pill">🔒 ${escapeHtml(isAr ? 'الصورة محجوبة لحماية الخصوصية' : 'Photo hidden for privacy')}</span>
         <span class="privacy-blur-sub">${escapeHtml(isAr ? 'لا يظهر الأصل سوى للملتقط والإدارة لمنع مطالبات التملك الباطلة.' : 'Only the finder and administrators can see this photo, to prevent false claims.')}</span>
       </div>`
    : '';
  const banner = r.is_suspicious
    ? `<div class="alert-box alert-warn" style="margin-top:10px;font-size:11.5px;">🚨 <strong>${escapeHtml(isAr ? 'قيد المراجعة الإدارية:' : 'Under review:')}</strong> ${escapeHtml(r.suspicious_reason || (isAr ? 'يقوم مسؤول النظام بمراجعة هذا البلاغ.' : 'An administrator is reviewing this report.'))}</div>`
    : '';
  const isAdmin = currentUser && currentUser.role === 'admin';
  const closed = ['Returned', 'Resolved'].includes(r.status);
  const canClaim = !isAdmin && r.type === 'FOUND' && !r.is_mine && !closed && !r.is_suspicious && ['Active', 'Claim Pending'].includes(r.status);

  const buttons = [];
  buttons.push(`<button class="btn btn-outline btn-sm" data-action="details" data-id="${r.id}">${escapeHtml(t('btnDetails'))}</button>`);
  if (canClaim) buttons.push(`<button class="btn btn-primary btn-sm" data-action="claim" data-id="${r.id}">${escapeHtml(isAr ? 'تقديم مطالبة' : 'Submit claim')}</button>`);
  if (r.is_mine && !closed && r.status !== 'Approved') buttons.push(`<button class="btn btn-outline btn-sm" title="${escapeHtml(t('btnEdit'))}" data-action="edit-report" data-id="${r.id}">✏️</button>`);
  if (!r.is_mine && !r.is_suspicious) buttons.push(`<button class="btn btn-outline btn-sm" title="${escapeHtml(isAr ? 'إبلاغ عن شبهة أو تكرار' : 'Flag as suspicious or duplicate')}" data-action="flag" data-id="${r.id}">🚩</button>`);
  if (r.is_mine && !closed) buttons.push(`<button class="btn btn-outline btn-sm" title="${escapeHtml(isAr ? 'حذف بلاغي' : 'Delete my report')}" data-action="delete-report" data-id="${r.id}">🗑️</button>`);

  const typeLabel = r.type === 'LOST'
    ? (isAr ? '📢 مفقود' : '📢 LOST')
    : (isAr ? '📦 معثور عليه' : '📦 FOUND');
  const statusLabel = isAr ? (STATUS_MAP[r.status] || r.status) : r.status;
  const locLabel = isAr ? (LOCATION_MAP[r.location] || r.location) : r.location;
  const catLabel = isAr ? (CATEGORY_MAP[r.category] || r.category) : r.category;
  const colLabel = isAr ? (COLOR_MAP[r.color] || r.color) : r.color;
  const marksHeading = isAr ? 'العلامات الفارقة:' : 'Distinguishing marks:';
  const reporterPrefix = isAr ? '👤 البلاغ بواسطة' : '👤';

  return `
    <div class="report-card ${r.is_suspicious ? 'suspicious-card' : ''}">
      <div class="report-img-wrap ${r.should_blur_photo ? 'privacy-blurred' : ''}">
        <div class="report-badges-top">
          <span class="type-badge ${r.type}">${typeLabel}</span>
          <span class="status-badge">${escapeHtml(statusLabel)}</span>
        </div>
        ${photo}
        ${overlay}
      </div>
      <div class="report-body">
        <div>
          <h4 class="report-title">${escapeHtml(r.title)}</h4>
          <div class="report-meta-tags">
            <span class="meta-pill">📍 ${escapeHtml(locLabel)}</span>
            <span class="meta-pill">🏷️ ${escapeHtml(catLabel)}</span>
            <span class="meta-pill">🎨 ${escapeHtml(colLabel)}</span>
            ${r.brand ? `<span class="meta-pill">✨ ${escapeHtml(r.brand)}</span>` : ''}
          </div>
          <p class="report-desc">${escapeHtml(r.description)}</p>
          <div class="report-marks-box"><strong>${marksHeading}</strong> ${escapeHtml(r.distinguishing_marks_display)}</div>
          ${banner}
        </div>
        <div class="report-footer">
          <span class="reporter-privacy-tag">${reporterPrefix} ${escapeHtml(r.reporter_label)} • ${escapeHtml(formatWhen(r.date_lost_found))}</span>
          <div style="display:flex;gap:6px;">${buttons.join('')}</div>
        </div>
      </div>
    </div>`;
}

function renderHomeView() {
  if (!currentUser) return;
  const isAdmin = currentUser.role === 'admin';
  const isAr = currentLang === 'ar';
  $('home-matches-container').innerHTML = allMatches.length
    ? allMatches.slice(0, 4).map(buildMatchCardHtml).join('')
    : emptyState(isAdmin
      ? (isAr ? 'لا توجد مطابقات حالياً. تظهر المطابقات آلياً عند تسجيل بلاغين متشابهين.' : 'No matches yet. They appear automatically when a lost and a found report look alike.')
      : (isAr ? 'لا توجد مطابقات حالياً. إذا قدمت بلاغاً عن مفقود، ستظهر أي معثورات مطابقة هنا.' : 'No matches yet. If you report a lost item, any matching found item will show up here.'));

  const visible = allReports.filter((r) => !['Returned', 'Resolved'].includes(r.status) && (!r.is_suspicious || r.is_mine || isAdmin));
  $('home-reports-container').innerHTML = visible.length
    ? visible.slice(0, 6).map(buildReportCardHtml).join('')
    : emptyState(isAr ? 'لا توجد بلاغات مسجلة حالياً. كن أول من يبلغ عن مفقود أو معثور عليه.' : 'No reports yet. Be the first — report a lost or found item.');
}

function applySearchFilters() {
  if (!currentUser) return;
  const isAr = currentLang === 'ar';
  const q = ($('filter-q').value || '').trim().toLowerCase();
  const type = $('filter-type').value;
  const category = $('filter-category').value;
  const location = $('filter-location').value;
  const color = $('filter-color').value;
  const dateVal = $('filter-date') ? $('filter-date').value : '';
  const isAdmin = currentUser.role === 'admin';

  let list = allReports.filter((r) => !['Returned', 'Resolved'].includes(r.status) && (!r.is_suspicious || r.is_mine || isAdmin));
  if (type !== 'ALL') list = list.filter((r) => r.type === type);
  if (category !== 'ALL') list = list.filter((r) => r.category === category);
  if (location !== 'ALL') list = list.filter((r) => r.location === location);
  if (color !== 'ALL') list = list.filter((r) => r.color === color);
  if (dateVal) list = list.filter((r) => String(r.date_lost_found || '').slice(0, 10) === dateVal);
  if (q) {
    list = list.filter((r) => [r.title, r.description, r.brand, r.location, r.category].some((f) => String(f || '').toLowerCase().includes(q)));
  }

  $('browse-reports-container').innerHTML = list.length
    ? list.map(buildReportCardHtml).join('')
    : emptyState(allReports.length
      ? (isAr ? 'لا توجد مقتنيات تطابق معايير البحث والتصفية.' : 'No items match your filters.')
      : (isAr ? 'لا توجد بلاغات مسجلة بعد.' : 'No reports yet.'));
}

function resetSearchFilters() {
  $('filter-q').value = '';
  if ($('filter-date')) $('filter-date').value = '';
  ['filter-type', 'filter-category', 'filter-location', 'filter-color'].forEach((id) => { $(id).value = 'ALL'; });
  applySearchFilters();
}

// ---------------------------------------------------------------------------
// Reporting an item
// ---------------------------------------------------------------------------
function nowForInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function resetReportForm() {
  $('create-report-form').reset();
  $('rep-date').value = nowForInput();
  $('rep-date').max = nowForInput();
  clearPhoto('report');
  const defaultType = (currentUser && currentUser.role === 'admin') ? 'FOUND' : ($('report-type-input').value || 'LOST');
  setReportFormType(defaultType);
}

function setReportFormType(type) {
  const safeType = (currentUser && currentUser.role === 'admin' && type === 'LOST') ? 'FOUND' : type;
  $('report-type-input').value = safeType;
  const found = safeType === 'FOUND';
  $('tab-btn-lost').className = `type-switch-btn${found ? '' : ' active-lost'}`;
  if (currentUser && currentUser.role === 'admin') $('tab-btn-lost').classList.add('hidden');
  $('tab-btn-found').className = `type-switch-btn${found ? ' active-found' : ''}`;
  $('found-handover-box').classList.toggle('hidden', !found);
  $('report-form-banner').innerHTML = found ? t('bannerFound') : t('bannerLost');
  if ($('rep-photo-label')) {
    $('rep-photo-label').textContent = found ? t('fieldPhotoRequired') : t('fieldPhoto');
  }
}

function clearPhoto(target) {
  photos[target] = { url: '', thumb: '', kb: 0 };
  const map = {
    report: ['rep-photo-preview', 'rep-photo-empty', 'rep-file-input'],
    claim: ['claim-photo-preview', 'claim-photo-empty', null],
    more: ['more-proof-photo-preview', 'more-proof-photo-empty', null]
  }[target];
  const img = $(map[0]);
  img.removeAttribute('src');
  hide(img);
  show($(map[1]));
  if (map[2]) $(map[2]).value = '';
  if (target === 'report') $('compression-telemetry').textContent = 'No photo selected';
}

// Compresses a picked image in the browser (max 900px, JPEG) and builds a tiny preview used for privacy blur.
function handleImageUpload(event, target) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    showToast('Please choose a JPEG, PNG or WebP image.', 'error');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const draw = (maxDim, quality) => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', quality);
      };
      const url = draw(900, 0.82);
      const thumb = draw(20, 0.5);
      const kb = Math.round((url.length * 0.75) / 1024);
      photos[target] = { url, thumb, kb };

      const previewIds = {
        report: ['rep-photo-preview', 'rep-photo-empty'],
        claim: ['claim-photo-preview', 'claim-photo-empty'],
        more: ['more-proof-photo-preview', 'more-proof-photo-empty']
      }[target];
      $(previewIds[0]).src = url;
      show($(previewIds[0]));
      hide($(previewIds[1]));
      if (target === 'report') {
        $('compression-telemetry').textContent = `Compressed ${(file.size / 1024).toFixed(0)} KB → ${kb} KB`;
      }
    };
    img.onerror = () => showToast('That image could not be read.', 'error');
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function handleCreateReportSubmit(e) {
  e.preventDefault();
  const type = $('report-type-input').value;
  if (currentUser && currentUser.role === 'admin') {
    return showToast(currentLang === 'ar' ? 'لا يمكن لمسؤول النظام تقديم بلاغات مفقودات أو معثورات.' : 'Administrators cannot report lost or found items.', 'error');
  }
  if (type === 'FOUND' && !photos.report.url) {
    return showToast(t('errFoundPhotoRequired'), 'error');
  }
  if (type === 'FOUND' && !$('rep-handed').checked) {
    return showToast('Please confirm that you are handing the item to the Lost & Found office.', 'error');
  }
  const when = new Date($('rep-date').value);
  if (Number.isNaN(when.getTime())) return showToast('Enter a valid date and time.', 'error');

  const submit = $('report-submit');
  submit.disabled = true;
  try {
    const res = await api('/reports', {
      method: 'POST',
      body: {
        type,
        title: $('rep-title').value,
        category: $('rep-category').value,
        color: $('rep-color').value,
        brand: $('rep-brand').value,
        location: $('rep-location').value,
        date_lost_found: when.toISOString(),
        description: $('rep-description').value,
        distinguishing_marks: $('rep-marks').value,
        photo_url: photos.report.url,
        photo_thumb_url: photos.report.thumb,
        handed_to_office: type === 'FOUND' && $('rep-handed').checked
      }
    });
    const n = res.matchStats.matchesFound;
    showToast(n > 0
      ? `Report saved. ${n} possible match${n === 1 ? '' : 'es'} found in ${res.matchStats.executionTimeMs} ms.`
      : 'Report saved. We will notify you if a match appears.');
    resetReportForm();
    await refreshAllData();
    switchView(n > 0 && type === 'LOST' ? 'claims' : 'home');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submit.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Claims (student side)
// ---------------------------------------------------------------------------
function openClaimModal(foundId, lostId) {
  if (currentUser && currentUser.role === 'admin') {
    return showToast(currentLang === 'ar' ? 'لا يمكن لمسؤول النظام تقديم مطالبة ملكية.' : 'Administrators cannot submit ownership claims.', 'error');
  }
  const found = allReports.find((r) => r.id === foundId) || allMatches.find((m) => m.found_report_id === foundId);
  const title = found ? (found.title || found.found_title) : `#${foundId}`;
  $('claim-found-report-id').value = foundId;
  $('claim-lost-report-id').value = lostId || '';
  $('claim-modal-subtitle').textContent = `Claiming found item #${foundId}: "${title}". Only the real owner can describe it accurately.`;
  $('claim-proof-text').value = '';
  clearPhoto('claim');
  show($('claim-modal'));
}

function closeClaimModal() { hide($('claim-modal')); }

async function handleSubmitClaim(e) {
  e.preventDefault();
  try {
    await api('/claims', {
      method: 'POST',
      body: {
        found_report_id: Number($('claim-found-report-id').value),
        lost_report_id: $('claim-lost-report-id').value ? Number($('claim-lost-report-id').value) : undefined,
        proof_description: $('claim-proof-text').value,
        proof_photo_url: photos.claim.url
      }
    });
    closeClaimModal();
    showToast('Claim submitted. An administrator will review it.');
    await refreshAllData();
    switchView('claims');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function claimPillClass(status) {
  if (status === 'More Proof Requested') return 'MoreProof';
  if (status === 'Hold Item') return 'Hold';
  return status;
}

function renderClaimsAndMatchesView() {
  if (!currentUser) return;
  const isAr = currentLang === 'ar';
  $('claims-view-matches').innerHTML = allMatches.length
    ? allMatches.map(buildMatchCardHtml).join('')
    : emptyState(isAr ? 'لا توجد مطابقات مقترحة حالياً.' : 'No matches right now.');

  const el = $('student-claims-container');
  const mine = currentUser.role === 'admin' ? allClaims : allClaims.filter((c) => c.claimant_id === currentUser.id);
  if (!mine.length) {
    el.innerHTML = emptyState(isAr ? 'لم تقدم أي مطالبات ملكية بعد.' : 'You have not submitted any ownership claims yet.');
    return;
  }

  el.innerHTML = mine.map((c) => {
    const isMine = c.claimant_id === currentUser.id;
    let action = '';
    const statusText = isAr ? (STATUS_MAP[c.status] || c.status) : c.status;
    if (c.status === 'More Proof Requested' && isMine) {
      action = `
        <div class="alert-box alert-warn" style="margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div><strong>🔎 ${isAr ? 'طلب المشرف إثباتات إضافية:' : 'The administrator needs more proof:'}</strong> "${escapeHtml(c.admin_feedback)}"</div>
          <button class="btn btn-warn btn-sm" data-action="more-proof" data-id="${c.id}">${isAr ? '+ تقديم إثبات' : '+ Provide proof'}</button>
        </div>`;
    } else if (c.status === 'Approved') {
      action = `
        <div class="alert-box" style="margin-top:12px;background:#eff6ff;border:1px solid #93c5fd;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div>
            <strong>🎉 ${isAr ? 'تمت الموافقة على المطالبة.' : 'Claim approved.'}</strong> ${escapeHtml(c.admin_feedback)}
            ${c.receipt_confirmed ? `<br/><span style="color:#059669;font-weight:700;">✓ ${isAr ? 'أكدت استلام المقتنى' : 'You confirmed receipt'}</span>` : ''}
          </div>
          ${!c.receipt_confirmed && isMine ? `<button class="btn btn-primary btn-sm" data-action="confirm-receipt" data-id="${c.id}">✍️ ${isAr ? 'استلمت المقتنى عيناً' : 'I received the item'}</button>` : ''}
        </div>`;
    } else if (c.status === 'Returned') {
      action = `<div class="alert-box" style="margin-top:12px;background:#d1fae5;color:#065f46;border:1px solid #6ee7b7;">✅ <strong>${isAr ? 'تم التسليم — أُغلقت القضية بنجاح.' : 'Returned — case resolved.'}</strong> ${escapeHtml(c.admin_feedback)}</div>`;
    } else if (c.status === 'Rejected' || c.status === 'Hold Item') {
      action = `<div class="alert-box alert-warn" style="margin-top:12px;"><strong>${escapeHtml(statusText)}:</strong> ${escapeHtml(c.admin_feedback)}</div>`;
    }

    const claimTitle = isAr ? `مطالبة #${c.id} • ${escapeHtml(c.found_title)}` : `Claim #${c.id} • ${escapeHtml(c.found_title)}`;
    const claimantMeta = isAr
      ? `بواسطة <strong>@${escapeHtml(c.claimant_username)}</strong> • ${escapeHtml(LOCATION_MAP[c.found_location] || c.found_location)} • ${escapeHtml(formatWhen(c.created_at))}`
      : `By <strong>@${escapeHtml(c.claimant_username)}</strong> • ${escapeHtml(c.found_location)} • ${escapeHtml(formatWhen(c.created_at))}`;

    return `
      <div class="claim-card">
        <div class="claim-card-header">
          <div>
            <strong>${claimTitle}</strong>
            <span style="font-size:12.5px;color:var(--text-light);margin-left:10px;margin-right:10px;">${claimantMeta}</span>
          </div>
          <span class="claim-status-pill ${claimPillClass(c.status)}">${escapeHtml(statusText)}</span>
        </div>
        <div style="margin-top:12px;font-size:13.5px;color:var(--text-main);">
          <strong>${isAr ? 'إثبات الملكية المقدم:' : 'Your proof:'}</strong> ${escapeHtml(c.proof_description)}
          ${c.additional_proof_text ? `<div style="margin-top:6px;color:#0284c7;"><strong>${isAr ? 'الإثبات الإضافي:' : 'Additional proof:'}</strong> ${escapeHtml(c.additional_proof_text)}</div>` : ''}
        </div>
        ${c.proof_photo_url ? `<div style="margin-top:10px;"><a href="${escapeHtml(c.proof_photo_url)}" target="_blank" class="btn btn-outline btn-sm">📎 ${isAr ? 'عرض صورة الإثبات المرفقة' : 'View proof photo'}</a></div>` : ''}
        ${c.additional_photo_url ? `<div style="margin-top:6px;"><a href="${escapeHtml(c.additional_photo_url)}" target="_blank" class="btn btn-outline btn-sm">📎 ${isAr ? 'عرض الإثبات الإضافي المرفق' : 'View additional photo'}</a></div>` : ''}
        ${action}
      </div>`;
  }).join('');
}

function openMoreProofModal(claimId) {
  const claim = allClaims.find((c) => c.id === claimId);
  $('more-proof-claim-id').value = claimId;
  $('more-proof-admin-prompt').textContent = `Administrator: "${claim ? claim.admin_feedback : ''}"`;
  $('more-proof-text').value = '';
  clearPhoto('more');
  show($('more-proof-modal'));
}

function closeMoreProofModal() { hide($('more-proof-modal')); }

async function handleMoreProofSubmit(e) {
  e.preventDefault();
  try {
    await api(`/claims/${Number($('more-proof-claim-id').value)}/more-proof`, {
      method: 'POST',
      body: { additional_proof_text: $('more-proof-text').value, additional_photo_url: photos.more.url }
    });
    closeMoreProofModal();
    showToast('Additional proof sent. Your claim is pending review again.');
    await refreshAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function confirmReceipt(claimId) {
  try {
    await api(`/claims/${claimId}/confirm-receipt`, { method: 'POST', body: {} });
    showToast('Thanks — receipt confirmed.');
    await refreshAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// Administrator: claims & moderation
// ---------------------------------------------------------------------------
function photoBlock(url, label) {
  return url
    ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" />`
    : '<div class="no-photo no-photo-box">No photo</div>';
}

function buildAdminClaimCard(c, dark) {
  const inputId = `${dark ? 'devops' : 'admin'}-feedback-${c.id}`;
  const act = (action, cls, label) =>
    `<button class="btn ${cls} btn-sm" data-action="admin-claim" data-id="${c.id}" data-act="${action}" data-input="${inputId}">${label}</button>`;

  let buttons = '';
  if (c.status === 'Pending') {
    buttons = act('request_more_proof', 'btn-warn', '🔎 Request more proof') + act('approve', 'btn-primary', '✅ Approve') + act('reject', 'btn-danger', '❌ Reject');
  } else if (c.status === 'More Proof Requested') {
    buttons = act('reject', 'btn-danger', '❌ Reject') + '<span style="font-size:12px;opacity:.8;">Waiting for the claimant…</span>';
  } else if (c.status === 'Approved' || c.status === 'Hold Item') {
    buttons = act('mark_returned', 'btn-success', '🤝 Verify ID & mark returned')
      + (c.status === 'Approved' ? act('verify_identity_no_hold', 'btn-outline', '⚠️ ID failed → hold item') : '');
  } else {
    buttons = `<span style="font-size:12px;opacity:.8;">Closed: ${escapeHtml(c.status)}</span>`;
  }

  return `
    <div class="${dark ? 'devops-claim-card' : 'claim-card'}">
      <div class="claim-card-header">
        <div>
          <strong style="font-size:15.5px;">Claim #${c.id}: ${escapeHtml(c.found_title)}</strong>
          <span style="font-size:12.5px;opacity:0.8;margin-left:10px;">Claimant <strong>@${escapeHtml(c.claimant_username)}</strong> • Finder <strong>@${escapeHtml(c.finder_username)}</strong> • ${escapeHtml(formatWhen(c.created_at))}</span>
        </div>
        <span class="claim-status-pill ${claimPillClass(c.status)}">${escapeHtml(c.status)}</span>
      </div>

      <div class="claim-comparison-grid">
        <div class="claim-col">
          <h5>1. Claimant's lost report</h5>
          ${c.lost_title ? photoBlock(c.lost_photo_url, 'Lost report') : ''}
          <div style="font-size:12.5px;">
            <strong>${escapeHtml(c.lost_title || 'No lost report linked')}</strong><br/>
            <span>Marks: ${escapeHtml(c.lost_marks || 'N/A')}</span>
          </div>
        </div>
        <div class="claim-col">
          <h5>2. Found item (unblurred)</h5>
          ${photoBlock(c.found_photo_url, 'Found item')}
          <div style="font-size:12.5px;">
            <strong>${escapeHtml(c.found_title)} (${escapeHtml(c.found_location)})</strong><br/>
            <span>Private marks: <strong>${escapeHtml(c.found_marks || 'None')}</strong></span>
          </div>
        </div>
        <div class="claim-col">
          <h5>3. Claimant's proof</h5>
          ${photoBlock(c.proof_photo_url, 'Proof')}
          <div style="font-size:12.5px;">
            <strong>Proof:</strong> ${escapeHtml(c.proof_description)}
            ${c.additional_proof_text ? `<div style="margin-top:4px;color:#38bdf8;"><strong>+ Additional:</strong> ${escapeHtml(c.additional_proof_text)}</div>` : ''}
            ${c.additional_photo_url ? photoBlock(c.additional_photo_url, 'Additional proof') : ''}
          </div>
        </div>
      </div>

      <div class="devops-action-bar">
        <input type="text" id="${inputId}" maxlength="500" class="${dark ? 'devops-feedback-input' : ''}"
          style="${dark ? '' : 'flex:1;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;'}"
          placeholder="Optional note to the student…" />
        <div style="display:flex;flex-wrap:wrap;gap:8px;">${buttons}</div>
      </div>
    </div>`;
}

async function adminClaimAction(claimId, action, inputId) {
  const input = $(inputId);
  try {
    await api(`/claims/${claimId}/admin-action`, { method: 'POST', body: { action, admin_feedback: input ? input.value.trim() : '' } });
    const labels = {
      request_more_proof: 'More proof requested. The student was notified.',
      approve: 'Claim approved. The student was notified.',
      reject: 'Claim rejected.',
      verify_identity_no_hold: 'Item placed on hold.',
      mark_returned: 'Item marked as returned. Case resolved.'
    };
    showToast(labels[action] || 'Claim updated.');
    await refreshAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function flagReport(reportId) {
  try {
    await api(`/reports/${reportId}/flag`, { method: 'POST', body: { reason: 'Flagged by a campus member as suspicious or a duplicate.' } });
    showToast('Thanks. An administrator will review this report.');
    await refreshAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteOwnReport(reportId) {
  if (!window.confirm('Delete this report? This cannot be undone.')) return;
  try {
    await api(`/reports/${reportId}`, { method: 'DELETE', body: {} });
    showToast('Report deleted.');
    await refreshAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function moderateReport(reportId, action) {
  const confirmations = {
    delete_report: 'Delete this report permanently?',
    suspend_user: 'Suspend the owner of this report? They will be signed out and unable to log in.'
  };
  if (confirmations[action] && !window.confirm(confirmations[action])) return;
  try {
    await api(`/reports/${reportId}/moderate`, { method: 'POST', body: { action } });
    showToast({ dismiss_flag: 'Flag dismissed. The report stays active.', delete_report: 'Report deleted.', suspend_user: 'User suspended.' }[action]);
    await refreshAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function buildModerationCard(r, dark) {
  return `
    <div class="${dark ? 'devops-mod-card' : 'claim-card'}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="type-badge ${r.type}">#${r.id} • ${r.type}</span>
        <span style="font-size:12px;color:#fbbf24;font-weight:700;">🚩 FLAGGED</span>
      </div>
      <h4 style="margin-top:10px;font-size:16px;">${escapeHtml(r.title)}</h4>
      <p style="font-size:12.5px;opacity:0.85;margin-top:4px;">Posted by <strong>@${escapeHtml(r.owner_username)}</strong> at ${escapeHtml(r.location)}</p>
      <p style="font-size:12.5px;margin-top:8px;">${escapeHtml(r.description)}</p>
      <p style="font-size:12.5px;margin-top:8px;padding:8px;background:rgba(245,158,11,0.15);border-radius:8px;"><strong>Reason:</strong> ${escapeHtml(r.suspicious_reason || 'Suspicious or duplicate listing')}</p>
      <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:8px;">
        <button class="btn btn-success btn-sm" data-action="moderate" data-id="${r.id}" data-act="dismiss_flag">✓ Valid — dismiss flag</button>
        <button class="btn btn-warn btn-sm" data-action="moderate" data-id="${r.id}" data-act="delete_report">🗑️ Delete report</button>
        <button class="btn btn-danger btn-sm" data-action="moderate" data-id="${r.id}" data-act="suspend_user">🚫 Suspend @${escapeHtml(r.owner_username)}</button>
      </div>
    </div>`;
}

function renderAdminWorkspaceView() {
  if (!currentUser || currentUser.role !== 'admin') return;
  const keepFocus = (id) => { const el = document.activeElement; return el && el.tagName === 'INPUT' && $(id).contains(el); };

  if (!keepFocus('admin-page-claims-list')) {
    $('admin-page-claims-list').innerHTML = allClaims.length ? allClaims.map((c) => buildAdminClaimCard(c, false)).join('') : emptyState('No ownership claims yet.');
  }
  const flagged = allReports.filter((r) => r.is_suspicious);
  $('admin-page-suspicious-list').innerHTML = flagged.length ? flagged.map((r) => buildModerationCard(r, false)).join('') : emptyState('No flagged reports.');
}

// ---------------------------------------------------------------------------
// DevOps console (administrators only)
// ---------------------------------------------------------------------------
function toggleDevOpsModal(force) {
  if (!currentUser || currentUser.role !== 'admin') return;
  const overlay = $('devops-overlay');
  const open = typeof force === 'boolean' ? force : overlay.classList.contains('hidden');
  overlay.classList.toggle('hidden', !open);
  if (open) refreshAllData();
}

function switchDevOpsTab(tab) {
  document.querySelectorAll('.devops-tab').forEach((b) => b.classList.toggle('active', b.dataset.dtab === tab));
  ['claims', 'moderation', 'telemetry'].forEach((t) => $(`dpanel-${t}`).classList.toggle('hidden', t !== tab));
}

function renderDevOpsConsole() {
  if (!currentUser || currentUser.role !== 'admin' || !overview) return;
  const flagged = allReports.filter((r) => r.is_suspicious);
  $('dtab-claims-count').textContent = allClaims.length;
  $('dtab-mod-count').textContent = flagged.length;

  const insideInput = (id) => { const el = document.activeElement; return el && el.tagName === 'INPUT' && $(id).contains(el); };
  if (!insideInput('devops-claims-container')) {
    $('devops-claims-container').innerHTML = allClaims.length
      ? allClaims.map((c) => buildAdminClaimCard(c, true)).join('')
      : '<div class="devops-panel-intro">No ownership claims yet. They appear here as soon as a student submits one.</div>';
  }
  $('devops-moderation-container').innerHTML = flagged.length
    ? flagged.map((r) => buildModerationCard(r, true)).join('')
    : '<div class="devops-panel-intro">No flagged reports.</div>';

  const c = overview.counts;
  const row = (label, value, color = '#e2e8f0') => `<li><span>${escapeHtml(label)}</span><strong style="color:${color};">${escapeHtml(value)}</strong></li>`;
  $('devops-nfr-list').innerHTML = [
    row('Database', `${overview.database.engine} — ${overview.database.file}`, overview.database.persistent ? '#34d399' : '#fbbf24'),
    row('Accounts', c.users),
    row('Reports (lost / found)', `${c.reports} (${c.lost} / ${c.found})`),
    row('Matches', c.matches),
    row('Ownership claims', c.claims),
    row('Active sessions', c.sessions),
    row('Last match time (limit 3000 ms)', overview.nfr.lastMatchLatencyMs === null ? 'no matches yet' : `${overview.nfr.lastMatchLatencyMs} ms`, '#34d399'),
    row('Max photo size', `${overview.nfr.maxImageSizeKb} KB`)
  ].join('');

  $('devops-users-table-wrap').innerHTML = `
    <table style="width:100%;font-size:12.5px;border-collapse:collapse;">
      <thead>
        <tr style="text-align:left;color:#7dd3fc;border-bottom:1px solid rgba(56,189,248,0.2);">
          <th style="padding:6px;">ID</th><th style="padding:6px;">Username</th><th style="padding:6px;">Role</th>
          <th style="padding:6px;">Reports</th><th style="padding:6px;">Status</th><th style="padding:6px;">Action</th>
        </tr>
      </thead>
      <tbody>
        ${overview.users.map((u) => `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
            <td style="padding:6px;">#${u.id}</td>
            <td style="padding:6px;font-weight:700;">@${escapeHtml(u.username)}</td>
            <td style="padding:6px;">${escapeHtml(u.role === 'admin' ? 'admin' : 'user')}</td>
            <td style="padding:6px;">${u.report_count}</td>
            <td style="padding:6px;color:${u.status === 'active' ? '#34d399' : '#f87171'};font-weight:700;">${escapeHtml(u.status)}</td>
            <td style="padding:6px;">${u.role === 'admin' ? '—' : `<button class="devops-btn" style="padding:3px 8px;font-size:11px;" data-action="toggle-user" data-id="${u.id}">${u.status === 'active' ? 'Suspend' : 'Restore'}</button>`}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  $('devops-logs-terminal').innerHTML = overview.recentLogs.length
    ? overview.recentLogs.map((l) => `
        <div class="log-line">
          <span style="color:#94a3b8;">[${escapeHtml(new Date(l.created_at).toLocaleTimeString())}]</span>
          <strong style="color:#fbbf24;">[${escapeHtml(l.event_type)}]</strong>
          <span>${escapeHtml(l.summary)}</span>
        </div>`).join('')
    : '<div class="log-line">No events yet.</div>';
}

async function toggleUserSuspend(userId) {
  try {
    const res = await api(`/admin/users/${userId}/toggle-status`, { method: 'POST', body: {} });
    showToast(res.status === 'suspended' ? 'User suspended and signed out.' : 'User restored.');
    await refreshAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function wipeAllData() {
  const typed = window.prompt('This permanently deletes ALL reports, claims, matches, notifications and every account except "admin".\n\nType WIPE to confirm:');
  if (typed === null) return;
  if (typed.trim() !== 'WIPE') return showToast('Cancelled — you did not type WIPE.', 'error');
  try {
    await api('/admin/reset', { method: 'POST', body: { confirm: 'WIPE' } });
    showToast('Database wiped. Only the admin account remains.');
    await refreshAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
function toggleNotificationsDrawer(force) {
  const drawer = $('notifications-drawer');
  const open = typeof force === 'boolean' ? force : drawer.classList.contains('hidden');
  drawer.classList.toggle('hidden', !open);
}

function renderNotificationsDrawer() {
  const list = $('notifications-list');
  if (!userNotifications.length) {
    list.innerHTML = emptyState('You have no notifications yet.');
    return;
  }
  list.innerHTML = userNotifications.map((n) => `
    <div class="notif-item ${n.is_read ? '' : 'unread'}">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:4px;">
        <strong>${escapeHtml(n.type)}</strong>
        <span>${escapeHtml(formatWhen(n.created_at))}</span>
      </div>
      <h5>${escapeHtml(n.title)}</h5>
      <p>${escapeHtml(n.message)}</p>
    </div>`).join('');
}

async function markAllNotificationsRead() {
  try {
    await api('/notifications/read-all', { method: 'POST', body: {} });
    await refreshAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// Item Details & Edit Report Modals
// ---------------------------------------------------------------------------
function openItemDetailsModal(reportId) {
  const r = allReports.find((item) => item.id === reportId);
  if (!r) return;
  const isAr = currentLang === 'ar';
  const locLabel = isAr ? (LOCATION_MAP[r.location] || r.location) : r.location;
  const catLabel = isAr ? (CATEGORY_MAP[r.category] || r.category) : r.category;
  const colLabel = isAr ? (COLOR_MAP[r.color] || r.color) : r.color;
  const statusLabel = isAr ? (STATUS_MAP[r.status] || r.status) : r.status;
  const typeLabel = r.type === 'LOST' ? (isAr ? '📢 مفقود' : '📢 LOST') : (isAr ? '📦 معثور عليه' : '📦 FOUND');

  $('details-modal-title').textContent = r.title;
  $('details-modal-subtitle').textContent = `${typeLabel} • ${statusLabel} • #${r.id}`;

  const photoHtml = r.photo_url
    ? `<div class="report-img-wrap ${r.should_blur_photo ? 'privacy-blurred' : ''}" style="border-radius:12px;overflow:hidden;margin-bottom:14px;">
         <img src="${escapeHtml(r.photo_url)}" alt="" style="width:100%;max-height:260px;object-fit:cover;display:block;" />
         ${r.should_blur_photo ? `<div class="privacy-blur-overlay"><span class="privacy-blur-pill">🔒 ${escapeHtml(isAr ? 'الصورة محجوبة لحماية الخصوصية' : 'Photo hidden for privacy')}</span></div>` : ''}
       </div>`
    : '';

  $('details-modal-body').innerHTML = `
    ${photoHtml}
    <div class="report-meta-tags" style="margin-bottom:12px;">
      <span class="meta-pill">📍 ${escapeHtml(locLabel)}</span>
      <span class="meta-pill">🏷️ ${escapeHtml(catLabel)}</span>
      <span class="meta-pill">🎨 ${escapeHtml(colLabel)}</span>
      ${r.brand ? `<span class="meta-pill">✨ ${escapeHtml(r.brand)}</span>` : ''}
      <span class="meta-pill">🕒 ${escapeHtml(formatWhen(r.date_lost_found))}</span>
    </div>
    <p style="line-height:1.6;margin-bottom:12px;">${escapeHtml(r.description)}</p>
    <div class="report-marks-box"><strong>${escapeHtml(isAr ? 'العلامات الفارقة:' : 'Distinguishing marks:')}</strong> ${escapeHtml(r.distinguishing_marks_display)}</div>
    <div style="margin-top:10px;font-size:12.5px;color:var(--text-muted);">👤 ${escapeHtml(r.reporter_label)}</div>
  `;

  const isAdmin = currentUser && currentUser.role === 'admin';
  const closed = ['Returned', 'Resolved'].includes(r.status);
  const canClaim = !isAdmin && r.type === 'FOUND' && !r.is_mine && !closed && !r.is_suspicious && ['Active', 'Claim Pending'].includes(r.status);
  const footerBtns = [`<button type="button" class="btn btn-outline" onclick="closeItemDetailsModal()">${escapeHtml(t('closeBtn'))}</button>`];
  if (r.is_mine && !closed && r.status !== 'Approved') {
    footerBtns.push(`<button type="button" class="btn btn-outline" onclick="closeItemDetailsModal(); openEditReportModal(${r.id});">${escapeHtml(t('btnEdit'))}</button>`);
  }
  if (canClaim) {
    footerBtns.push(`<button type="button" class="btn btn-primary" onclick="closeItemDetailsModal(); openClaimModal(${r.id}, null);">${escapeHtml(isAr ? 'تقديم مطالبة' : 'Submit claim')}</button>`);
  }
  $('details-modal-footer').innerHTML = footerBtns.join('');
  show($('item-details-modal'));
}

function closeItemDetailsModal() {
  hide($('item-details-modal'));
}

function openEditReportModal(reportId) {
  const r = allReports.find((item) => item.id === reportId);
  if (!r) return;
  $('edit-modal-title').textContent = t('editReportTitle');
  $('edit-modal-subtitle').textContent = t('editReportSub');
  $('edit-save-btn').textContent = t('saveChanges');
  $('edit-report-id').value = String(r.id);
  $('edit-report-type').value = r.type;
  $('edit-title').value = r.title || '';
  $('edit-category').value = r.category || '';
  $('edit-color').value = r.color || '';
  $('edit-brand').value = r.brand || '';
  $('edit-location').value = r.location || '';

  const d = new Date(r.date_lost_found);
  if (!Number.isNaN(d.getTime())) {
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    $('edit-date').value = d.toISOString().slice(0, 16);
  }
  $('edit-date').max = nowForInput();
  $('edit-description').value = r.description || '';
  $('edit-marks').value = r.distinguishing_marks || '';
  show($('edit-report-modal'));
}

function closeEditReportModal() {
  hide($('edit-report-modal'));
}

async function handleEditReportSubmit(e) {
  e.preventDefault();
  const id = Number($('edit-report-id').value);
  const when = new Date($('edit-date').value);
  if (Number.isNaN(when.getTime())) return showToast('Enter a valid date and time.', 'error');

  const btn = $('edit-save-btn');
  btn.disabled = true;
  try {
    await api(`/reports/${id}`, {
      method: 'PUT',
      body: {
        title: $('edit-title').value,
        category: $('edit-category').value,
        color: $('edit-color').value,
        brand: $('edit-brand').value,
        location: $('edit-location').value,
        date_lost_found: when.toISOString(),
        description: $('edit-description').value,
        distinguishing_marks: $('edit-marks').value
      }
    });
    closeEditReportModal();
    showToast(currentLang === 'ar' ? 'تم تحديث البلاغ وإعادة المطابقة بنجاح.' : 'Report updated and matching refreshed.');
    await refreshAllData();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// One click handler for all buttons that act on a record (no inline JS with user data)
// ---------------------------------------------------------------------------
function handleDelegatedClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  switch (btn.dataset.action) {
    case 'details': return openItemDetailsModal(id);
    case 'edit-report': return openEditReportModal(id);
    case 'claim': return openClaimModal(id, btn.dataset.lost ? Number(btn.dataset.lost) : null);
    case 'flag': return flagReport(id);
    case 'delete-report': return deleteOwnReport(id);
    case 'more-proof': return openMoreProofModal(id);
    case 'confirm-receipt': return confirmReceipt(id);
    case 'admin-claim': return adminClaimAction(id, btn.dataset.act, btn.dataset.input);
    case 'moderate': return moderateReport(id, btn.dataset.act);
    case 'toggle-user': return toggleUserSuspend(id);
    default: return undefined;
  }
}
