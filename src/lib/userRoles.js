// ЕДИНЫЙ справочник сотрудников и ролей. Чистый модуль без импортов —
// его читают и клиент (TicketContext), и serverless-функции (api/academy-token).
// Добавление сотрудника — по-прежнему одно место: этот объект.
// ─── Strict Whitelist and Role Mapping ─────────────────────────────────────────
// Only these exact email addresses are allowed to access the application.
// You can easily manage who gets what role and club in this single place!
export const USER_ROLES = {
  // ── Chefs (full admin) ────────────────────────────────────────────────────
  'dilshat.r@hj.fit': { role: 'chef', club: null, displayName: 'Дильшат' },
  'magzhan@hj.fit':   { role: 'chef', club: null, displayName: 'Магжан' },
  'iliyas.s@hj.fit':  { role: 'chef', club: null, displayName: 'Илияс' },
  'anuar@hj.fit':     { role: 'chef', club: null, displayName: 'Ануар' },
  'adil@hj.fit':      { role: 'chef', club: null, displayName: 'Адиль Утепбергенов' }, // разработчик, права chef

  // ── 4YOU ─────────────────────────────────────────────────────────────────
  'saniya@hj.fit':              { role: 'manager', club: '4YOU', displayName: 'Сания' },
  'kurbanovtimur585@gmail.com': { role: 'manager', club: '4YOU', displayName: 'Тимур' },
  'nurly@hj.fit':               { role: 'manager', club: '4YOU', displayName: 'Нурлы' },

  // ── COLIBRI ───────────────────────────────────────────────────────────────
  '19.anastasiya.tkachenko.88@gmail.com': { role: 'manager', club: 'COLIBRI', displayName: 'Анастасия' },
  'daewure@mail.ru':              { role: 'manager', club: 'COLIBRI', displayName: 'Аружан' },
  'loshkadishka3006@gmail.com':   { role: 'admin', club: 'COLIBRI', displayName: 'Алишер' },

  // ── VILLA ─────────────────────────────────────────────────────────────────
  'diassd9806@gmail.com':   { role: 'manager', club: 'VILLA', displayName: 'Диас' },
  'kelessovaan@gmail.com':  { role: 'manager', club: 'VILLA', displayName: 'Алина' },

  // ── NURLY ORDA ────────────────────────────────────────────────────────────
  'ainura030594@gmail.com': { role: 'manager', club: 'NURLY ORDA', displayName: 'Айнур' },
  'azimuus@gmail.com':      { role: 'manager', club: 'NURLY ORDA', clubs: ['NURLY ORDA', 'EUROPE CITY'], displayName: 'Азиз' },

  // ── PROMENADE ─────────────────────────────────────────────────────────────
  'k.useingazin@gmail.com': { role: 'manager', club: 'PROMENADE', displayName: 'Куат' },
  'adaienough@gmail.com':   { role: 'manager', club: 'PROMENADE', displayName: 'Адай' },
  'sabirameb@gmail.com':    { role: 'manager', club: 'PROMENADE', displayName: 'Сабира' },

  // ── EUROPE CITY ───────────────────────────────────────────────────────────
  'edokjp@gmail.com':  { role: 'manager', club: 'EUROPE CITY', displayName: 'Эдель' },
  'k.dana_01@list.ru': { role: 'manager', club: 'EUROPE CITY', displayName: 'Дана' },

  // ── RESTRICTED ADMINS (schedule + sales only, no financials, no warehouse) ──
  'admin-colibri@hj.fit':   { role: 'admin', club: 'COLIBRI',     displayName: 'Админ Colibri'     },
  'admin-villa@hj.fit':     { role: 'admin', club: 'VILLA',       displayName: 'Админ Villa'       },
  'admin-4you@hj.fit':      { role: 'admin', club: '4YOU',        displayName: 'Админ 4you'        },
  'admin-nurlyorda@hj.fit': { role: 'admin', club: 'NURLY ORDA',  displayName: 'Админ Nurly Orda'  },
  'admin-promenade@hj.fit': { role: 'admin', club: 'PROMENADE',   displayName: 'Админ Promenade'   },
  'admin-europecity@hj.fit':{ role: 'admin', club: 'EUROPE CITY', displayName: 'Админ Europe City' },
  'ikoperper@gmail.com':              { role: 'admin', club: '4YOU', displayName: 'Искандер'  },
  'alibekakniet38@gmail.com':         { role: 'admin', club: '4YOU', displayName: 'Акниет'    },
  'bhtg.l.bhtg.l@gmail.com':         { role: 'admin', club: '4YOU', displayName: 'Бахыткуль' },
  'abisheva.alua07@gmail.com':        { role: 'admin', club: '4YOU', displayName: 'Алуа'      },
  'abuzalma8@gmail.com':              { role: 'manager', club: 'COLIBRI', displayName: 'Абулхаир'  },
  'ibrayevana@mail.ru':               { role: 'admin', club: '4YOU', displayName: 'Назым'     },
  'hedabatyrova.14@gmail.com':        { role: 'admin', club: '4YOU', displayName: 'Хеда'      },
  'yussentyan@gmail.com':             { role: 'admin', club: 'COLIBRI', displayName: 'Юссен'     },
  'shapagat.mukhametkaliyeva@mail.ru':{ role: 'admin', club: 'COLIBRI', displayName: 'Шапагат'   },
  'kasel00405@gmail.com':             { role: 'admin', club: 'COLIBRI', displayName: 'Асель'     },
  'zhaniya.m12@gmail.com':            { role: 'admin', club: 'COLIBRI', displayName: 'Жания'     },
  'utemisovazarina1912@gmail.com':    { role: 'admin', club: 'COLIBRI', displayName: 'Зарина'    },

  // ── VILLA ─────────────────────────────────────────────────────────────────
  'asemnurkabek@gmail.com':  { role: 'admin', club: 'VILLA', displayName: 'Ермекқызы Әсем'  },
  'rrrkh.257@mail.ru':       { role: 'admin', club: 'VILLA', displayName: 'Рахимбаева Асем' },
  'mkayrlynova@mail.ru':     { role: 'admin', club: 'VILLA', displayName: 'Меруерт' },
  'kushanlos123@gmail.com':  { role: 'admin', club: 'VILLA', displayName: 'Салим'   },

  // ── PROMENADE ─────────────────────────────────────────────────────────────
  'maryamkb100707@gmail.com':      { role: 'admin', club: 'PROMENADE', displayName: 'Марьям' },
  'sarakayevaf@gmail.com':         { role: 'admin', club: 'PROMENADE', displayName: 'Фатима' },
  'infosun2818@gmail.com':         { role: 'admin', club: 'PROMENADE', displayName: 'Санжар' },
  'zhamilyakuskulakova@gmail.com': { role: 'admin', club: 'PROMENADE', displayName: 'Жамиля' },
  'armetidq@icloud.com':           { role: 'admin', club: 'PROMENADE', displayName: 'Аружан' },

  // ── Marketing (restricted warehouse views, all clubs) ─────────────────────
  'guldana.k@hj.fit': { role: 'marketing', club: null, displayName: 'Гульдана' },

  // ── Коммерческий директор (новости, склад, соглашения, настройки) ─────────
  'madina@hj.fit': { role: 'komdir', club: null, displayName: 'Мадина' },

  // ── РОПы (руководители отделов продаж) — права Ком-Дира, но только свой клуб ──
  'saltanat@hj.fit':        { role: 'rop', club: 'VILLA',      displayName: 'Салтанат' },
  'blinsalta19@gmail.com':  { role: 'rop', club: 'VILLA',      displayName: 'Салтанат' },
  'umitony99@gmail.com':    { role: 'rop', club: 'COLIBRI',    displayName: 'Умида' },
  'aiman.k@hj.fit':         { role: 'rop', club: '4YOU',       displayName: 'Айман' },
  'iamkamilya23@gmail.com': { role: 'rop', club: 'NURLY ORDA', displayName: 'Камиля' },
  'sladosstt@gmail.com':    { role: 'rop', club: 'PROMENADE',  displayName: 'РОП Promenade' },
  'kamzinova3@gmail.com':   { role: 'rop', club: 'EUROPE CITY', displayName: 'Камзинова' },

  // ── Наблюдатель «Утерянные вещи» — только эта вкладка, только просмотр ────
  'luiza_1101@mail.ru': { role: 'lostviewer', club: null, displayName: 'Луиза' },

  // ── Viewer (no tickets, schedule, calls, dashboard, archive) ──────────────
  // tech — техник: только Чек-листы и InStudio, по всем клубам
  'nurali.m@hj.fit': { role: 'tech', club: null, displayName: 'Нурали' },
  'roman.v@hj.fit': { role: 'chef', club: null, displayName: 'Роман' },
  'madiyar.a@hj.fit': { role: 'tech', club: null, displayName: 'Мадияр' },
  'iliyas.s@hj.fit': { role: 'chef', club: null, displayName: 'Илияс' },
};

// ─── Академия (SSO, api/academy-token): что передаётся в heros-journey-trainee ──
// В записи сотрудника выше можно задать ПЕРСОНАЛЬНЫЕ поля (они сильнее маппинга):
//   phone: '77771112233'   — по нему академия переносит прогресс со старого аккаунта
//   probation: true        — испытательный срок (academyLevel 'probation')
//   academyRole: 'coach'   — отдел академии вручную (admin|service|sales|coach)
//   academyMentor: ['sales'] — где человек наставник
//   academyAdmin: true     — главный наставник академии (только один человек)

// Отдел академии по роли HJ Track
export const ACADEMY_ROLE_BY_HJ = {
  chef: 'admin',
  manager: 'admin',
  admin: 'admin',
  rop: 'sales',
  komdir: 'sales',
  marketing: 'admin',
  viewer: 'admin',
  tech: 'service',
  lostviewer: 'admin',
  guest: 'admin',
};

// Наставничество по роли: шефы — везде, менеджеры — над админами,
// РОП и Ком-Дир — над отделом продаж. Остальные — не наставники.
export const ACADEMY_MENTOR_BY_HJ = {
  chef: ['admin', 'service', 'sales', 'coach'],
  manager: ['admin'],
  rop: ['sales'],
  komdir: ['sales'],
};

