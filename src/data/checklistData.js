import { Coffee, Sun, Moon, Activity, Sparkles, Wrench, ShieldCheck } from 'lucide-react';

export const CLUBS = ['ВСЕ КЛУБЫ', '4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA'];

export const CHECK_ITEMS = {
  'equipment': {
    title: 'Оборудование и тренажеры',
    icon: Activity,
    items: [
      'Кардио-тренажеры( Bootcamp, Metcon)',
      'Проверка силовых тренажеров (тросы, обивка)',
      'Смазка направляющих штанг и тренажеров',
      'Проверка и расстановка гантельного ряда',
      'Дезинфекция ковриков и мелкого инвентаря',
      'Проверка работоспособности мониторов и ТВ'
    ]
  },
  'cleaning': {
    title: 'Чек-лист по уборке',
    icon: Sparkles,
    noTicket: true,
    items: [
      'Уборка раздевалок и санузлов',
      'Наполнение дозаторов мылом и антисептиком',
      'Пополнение бумажных полотенец и салфеток',
      'Протирка всех зеркальных поверхностей в залах',
      'Контроль выноса мусора из всех зон'
    ]
  },
  'tech': {
    title: 'Технический обход',
    icon: Wrench,
    items: [
      'Проверка всех осветительных приборов (замена ламп)',
      'Контроль температурного режима и вентиляции',
      'Проверка и санитарная обработка кулеров',
      'Осмотр целостности напольного покрытия (резина/ковролин)',
      'Проверка доводчиков дверей и входной группы',
      'Проверка работоспособности камер',
      '§Вентиляция и климат',
      'Проверка приточно-вытяжной вентиляции (подача/вытяжка)',
      'Проверка чиллера (показания давления, температуры)',
      'Проверка кондиционирования (фанкойлы, дренаж)',
      'Проверка рекуператора (фильтры, заслонки, показания)'
    ]
  },
  'opening': {
    title: 'Открытие смены',
    icon: ShieldCheck,
    items: [
      'Проверка рабочего места',
      'Включение залов',
      'Пересчитать пульсометры',
      'Пересчитать полотенца'
    ]
  },
  'closing': {
    title: 'Закрытие смены',
    icon: Moon,
    items: [
      'Проверка рабочего места',
      'Отключение залов',
      'Пересчитать пульсометры',
      'Пересчитать полотенца',
      'Контрольный обход на предмет закрытых окон/дверей'
    ]
  }
};

export const SHIFTS_DATA = [
  { 
    id: 'morning', 
    time: '6:30', 
    name: 'Утренняя смена', 
    icon: Coffee, 
    color: '#f97316', 
    cards: ['equipment', 'cleaning', 'tech', 'opening']
  },
  { 
    id: 'day', 
    time: '11:30', 
    name: 'Дневная смена', 
    icon: Sun, 
    color: '#facc15', 
    cards: ['equipment', 'cleaning', 'tech']
  },
  { 
    id: 'evening', 
    time: '16:30', 
    name: 'Вечерняя смена', 
    icon: Moon, 
    color: '#6366f1', 
    cards: ['equipment', 'cleaning', 'tech']
  },
  { 
    id: 'night', 
    time: '21:30', 
    name: 'Ночная смена', 
    icon: Moon, 
    color: '#a855f7', 
    isCurrent: true,
    cards: ['equipment', 'cleaning', 'tech', 'closing']
  },
];

export const getShiftsForDate = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const day = d.getDay();
  const isWeekend = day === 0 || day === 6; // 0 is Sunday, 6 is Saturday

  // Calculate isCurrent if we are looking at the current day
  const isToday = new Date().toDateString() === d.toDateString();
  const currentHour = new Date().getHours();
  const currentMinute = new Date().getMinutes();
  const totalMinutes = currentHour * 60 + currentMinute;

  if (isWeekend) {
    // Weekend shifts: 9:00, 14:00, 19:00
    // morning: 9:00 (540 mins) to 14:00 (840 mins)
    // day: 14:00 (840 mins) to 19:00 (1140 mins)
    // evening: 19:00 (1140 mins) to 9:00 (540 mins next day)
    let activeShiftId = 'evening';
    if (totalMinutes >= 540 && totalMinutes < 840) {
      activeShiftId = 'morning';
    } else if (totalMinutes >= 840 && totalMinutes < 1140) {
      activeShiftId = 'day';
    }

    return [
      {
        id: 'morning',
        time: '9:00',
        name: 'Утренняя смена',
        icon: Coffee,
        color: '#f97316',
        isCurrent: isToday && activeShiftId === 'morning',
        cards: ['equipment', 'cleaning', 'tech', 'opening']
      },
      {
        id: 'day',
        time: '14:00',
        name: 'Дневная смена',
        icon: Sun,
        color: '#facc15',
        isCurrent: isToday && activeShiftId === 'day',
        cards: ['equipment', 'cleaning', 'tech']
      },
      {
        id: 'evening',
        time: '19:00',
        name: 'Вечерняя смена',
        icon: Moon,
        color: '#6366f1',
        isCurrent: isToday && activeShiftId === 'evening',
        cards: ['equipment', 'cleaning', 'tech', 'closing']
      }
    ];
  }

  // Weekday shifts: 6:30, 11:30, 16:30, 21:30
  // morning: 6:30 (390 mins) to 11:30 (690 mins)
  // day: 11:30 (690 mins) to 16:30 (990 mins)
  // evening: 16:30 (990 mins) to 21:30 (1290 mins)
  // night: 21:30 (1290 mins) to 6:30 (390 mins next day)
  let activeShiftId = 'night';
  if (totalMinutes >= 390 && totalMinutes < 690) {
    activeShiftId = 'morning';
  } else if (totalMinutes >= 690 && totalMinutes < 990) {
    activeShiftId = 'day';
  } else if (totalMinutes >= 990 && totalMinutes < 1290) {
    activeShiftId = 'evening';
  }

  return [
    {
      id: 'morning',
      time: '6:30',
      name: 'Утренняя смена',
      icon: Coffee,
      color: '#f97316',
      isCurrent: isToday && activeShiftId === 'morning',
      cards: ['equipment', 'cleaning', 'tech', 'opening']
    },
    {
      id: 'day',
      time: '11:30',
      name: 'Дневная смена',
      icon: Sun,
      color: '#facc15',
      isCurrent: isToday && activeShiftId === 'day',
      cards: ['equipment', 'cleaning', 'tech']
    },
    {
      id: 'evening',
      time: '16:30',
      name: 'Вечерняя смена',
      icon: Moon,
      color: '#6366f1',
      isCurrent: isToday && activeShiftId === 'evening',
      cards: ['equipment', 'cleaning', 'tech']
    },
    {
      id: 'night',
      time: '21:30',
      name: 'Ночная смена',
      icon: Moon,
      color: '#a855f7',
      isCurrent: isToday && activeShiftId === 'night',
      cards: ['equipment', 'cleaning', 'tech', 'closing']
    },
  ];
};
