import { Coffee, Sun, Moon, Activity, Sparkles, Wrench, ShieldCheck } from 'lucide-react';

export const CLUBS = ['ВСЕ КЛУБЫ', '4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'MY TASK'];

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
      'Проверка доводчиков дверей и входной группы'
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
