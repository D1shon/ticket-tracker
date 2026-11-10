// 3D-модели клубов: одна запись на клуб, порядок = порядок вкладок на /club-model.
// Модель — автономная статичная страница в public/models/<slug>/index.html (Three.js),
// рядом лежат её данные (club-geom.json, club-plan.jpg). Новая модель = папка в public/models
// + ready: true здесь; доступ к вкладке считается по этому же списку (navAccess.js).
export const CLUB_MODELS = [
  // tour — фототур по инженерному помещению (public/models/<slug>/tour/, точки обзора по фото + кликабельные объекты)
  { club: 'COLIBRI',     slug: 'colibri',    ready: true,  title: '«Инвиктус», Валиханова 170', url: '/models/colibri/index.html', tour: '/models/colibri/tour/index.html', tourTitle: 'Фототур ТП' },
  { club: '4YOU',        slug: '4you',       ready: true,  title: 'ЖК «4you», 3 уровня',        url: '/models/4you/index.html' },
  { club: 'VILLA',       slug: 'villa',      ready: true,  title: 'Villa, цокольный этаж',      url: '/models/villa/index.html' },
  { club: 'NURLY ORDA',  slug: 'nurly-orda', ready: false },
  { club: 'PROMENADE',   slug: 'promenade',  ready: false },
  { club: 'EUROPE CITY', slug: 'europe-city', ready: false },
  { club: 'DUBAI',       slug: 'dubai',      ready: false },
];

export const userClubs = (user) =>
  [user?.club, ...(Array.isArray(user?.clubs) ? user.clubs : [])]
    .filter(Boolean).map(c => String(c).toUpperCase());

// у кого есть вкладка: шеф видит все клубы, остальные — только свои, и только если у клуба есть готовая модель
export const hasModelAccess = (user) => {
  if (user?.role === 'chef') return true;
  if (user?.role === 'guest' || user?.role === 'lostviewer' || user?.role === 'marketing') return false;
  const mine = userClubs(user);
  return CLUB_MODELS.some(m => m.ready && mine.includes(m.club));
};

// какие вкладки показать конкретному пользователю
export const modelsFor = (user) => {
  if (user?.role === 'chef') return CLUB_MODELS;
  const mine = userClubs(user);
  return CLUB_MODELS.filter(m => mine.includes(m.club));
};
