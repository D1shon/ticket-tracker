import React, { useState } from 'react';
import { ShieldCheck, Clock, Coffee, Sun, Moon, Activity, Sparkles, Wrench, ChevronDown, Calendar, MoreHorizontal, LayoutGrid } from 'lucide-react';

const CLUBS = ['ВСЕ КЛУБЫ', '4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'MY TASK'];

const SHIFTS_DATA = [
  { 
    id: 'morning', 
    time: '6:30', 
    name: 'Утренняя смена', 
    icon: Coffee, 
    color: '#f97316', 
    status: '4 проверки · не начато',
    cards: [
      { id: 1, title: 'Оборудование и тренажеры', count: '6 пунктов', icon: Activity },
      { id: 2, title: 'Чек-лист по уборке', count: '6 пунктов', icon: Sparkles },
      { id: 3, title: 'Технический обход', count: '5 пунктов', icon: Wrench },
      { id: 4, title: 'Открытие смены', count: '3 пункта', icon: ShieldCheck },
    ]
  },
  { 
    id: 'day', 
    time: '11:30', 
    name: 'Дневная смена', 
    icon: Sun, 
    color: '#facc15', 
    status: '3 проверки · не начато',
    cards: [
      { id: 5, title: 'Оборудование и тренажеры', count: '6 пунктов', icon: Activity },
      { id: 6, title: 'Чек-лист по уборке', count: '6 пунктов', icon: Sparkles },
      { id: 7, title: 'Технический обход', count: '5 пунктов', icon: Wrench },
    ]
  },
  { 
    id: 'evening', 
    time: '16:30', 
    name: 'Вечерняя смена', 
    icon: Moon, 
    color: '#6366f1', 
    status: '3 проверки · не начато',
    cards: [
      { id: 8, title: 'Оборудование и тренажеры', count: '6 пунктов', icon: Activity },
      { id: 9, title: 'Чек-лист по уборке', count: '6 пунктов', icon: Sparkles },
      { id: 10, title: 'Технический обход', count: '5 пунктов', icon: Wrench },
    ]
  },
  { 
    id: 'night', 
    time: '21:30', 
    name: 'Ночная смена', 
    icon: Moon, 
    color: '#a855f7', 
    status: '4 проверки · не начато',
    isCurrent: true,
    cards: [
      { id: 11, title: 'Оборудование и тренажеры', count: '6 пунктов', icon: Activity },
      { id: 12, title: 'Чек-лист по уборке', count: '6 пунктов', icon: Sparkles },
      { id: 13, title: 'Технический обход', count: '5 пунктов', icon: Wrench },
      { id: 14, title: 'Закрытие смены', count: '5 пунктов', icon: Moon },
    ]
  },
];

const CHECK_ITEMS = {
  'Оборудование и тренажеры': [
    'Проверка кардио-зоны (беговые дорожки, эллипсы)',
    'Проверка силовых тренажеров (тросы, обивка)',
    'Смазка направляющих штанг и тренажеров',
    'Проверка и расстановка гантельного ряда',
    'Дезинфекция ковриков и мелкого инвентаря',
    'Проверка работоспособности мониторов и ТВ'
  ],
  'Чек-лист по уборке': [
    'Генеральная уборка раздевалок и санузлов',
    'Наполнение дозаторов мылом и антисептиком',
    'Пополнение бумажных полотенец и салфеток',
    'Протирка всех зеркальных поверхностей в залах',
    'Глубокая очистка душевых кабин и сливов',
    'Контроль выноса мусора из всех зон'
  ],
  'Технический обход': [
    'Проверка всех осветительных приборов (замена ламп)',
    'Контроль температурного режима и вентиляции',
    'Проверка и санитарная обработка кулеров',
    'Осмотр целостности напольного покрытия (резина/ковролин)',
    'Проверка доводчиков дверей и входной группы'
  ],
  'Открытие смены': [
    'Проверка кассовой смены и наличности',
    'Снятие объекта с пультовой охраны',
    'Включение музыкального и ТВ оборудования'
  ],
  'Закрытие смены': [
    'Снятие Z-отчета и сверка итогов дня',
    'Постановка клуба на охранную сигнализацию',
    'Отключение системы кондиционирования и света',
    'Контрольный обход на предмет закрытых окон/дверей',
    'Отправка итогового отчета в чат руководства'
  ]
};

const ChecklistPage = () => {
  const [activeClub, setActiveClub] = useState('4YOU');
  const [activeDay, setActiveDay] = useState('СЕГОДНЯ');
  const [activeCheck, setActiveCheck] = useState(null); // { title, items, shift }
  const [checkedItems, setCheckedItems] = useState({});

  const handleToggleItem = (title, index) => {
    const key = `${title}-${index}`;
    setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const isCheckComplete = (title) => {
    const items = CHECK_ITEMS[title] || [];
    return items.every((_, i) => checkedItems[`${title}-${i}`]);
  };

  return (
    <div className="animate-fade" style={{ background: '#070708', minHeight: '100%', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Header Area */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <ShieldCheck style={{ color: '#a855f7' }} size={24} strokeWidth={2.5} />
            <h1 className="text-xl font-bold tracking-tight uppercase" style={{ letterSpacing: '0.02em' }}>Мониторинг клуба</h1>
          </div>
          <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Регулярные проверки по расписанию: 6:30 - 11:30 - 16:30 - 21:30
          </p>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex flex-col gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Клуб</span>
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#111113] border border-white/5">
            {CLUBS.map(club => (
              <button
                key={club}
                onClick={() => setActiveClub(club)}
                className={`px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  activeClub === club 
                    ? 'bg-[#222226] text-blue-400 border border-blue-500/20' 
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                {club}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 items-end">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Дата смен</span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#111113] border border-white/5">
              {['ВЧЕРА', 'СЕГОДНЯ'].map(day => (
                <button
                  key={day}
                  onClick={() => setActiveDay(day)}
                  className={`px-5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                    activeDay === day 
                      ? 'bg-[#7B3DFF] text-white' 
                      : 'text-white/40 hover:text-white/60'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111113] border border-white/5 text-[11px] font-bold text-white/70">
              <Calendar size={14} className="text-purple-500" />
              30.04.2026
            </div>
          </div>
        </div>
      </div>

      {/* Status Label */}
      <div className="flex items-center gap-2 mb-6 text-[10px] font-bold tracking-widest text-white/40 uppercase">
        <Clock size={12} className="text-purple-500" />
        Статус смен: {activeClub}
      </div>

      {/* Shifts List */}
      <div className="flex flex-col gap-6">
        {SHIFTS_DATA.map(shift => (
          <div 
            key={shift.id} 
            className={`relative rounded-2xl transition-all ${
              shift.isCurrent ? 'bg-[#0a0a0c]' : 'bg-transparent'
            }`}
            style={{ 
              border: shift.isCurrent ? '1px solid rgba(123,61,255,0.3)' : '1px solid transparent',
              boxShadow: shift.isCurrent ? '0 10px 40px rgba(0,0,0,0.4)' : 'none'
            }}
          >
            {/* Shift Header */}
            <div className="flex items-center justify-between p-5 pb-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#111113] border border-white/5 shadow-inner">
                  <shift.icon size={18} style={{ color: shift.color }} />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-bold flex items-center gap-2">
                      <span style={{ color: shift.color }}>{shift.time}</span>
                      <span className="text-white/90">{shift.name}</span>
                    </h3>
                    {shift.isCurrent && (
                      <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-[9px] font-black uppercase tracking-tighter border border-blue-500/20">сейчас</span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/30 font-medium mt-0.5">{shift.status}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button className="text-white/20 hover:text-white/40 transition-colors">
                  <MoreHorizontal size={18} />
                </button>
                <button className="text-white/20 hover:text-white/40 transition-colors">
                  <ChevronDown size={18} />
                </button>
              </div>
            </div>

            {/* Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-5 pt-0">
              {shift.cards.map(card => {
                const complete = isCheckComplete(card.title);
                return (
                  <div 
                    key={card.id}
                    onClick={() => setActiveCheck({ title: card.title, shift: shift.name })}
                    className={`group bg-[#111113] border rounded-2xl p-6 flex flex-col items-center justify-center gap-4 hover:bg-[#151518] transition-all cursor-pointer shadow-sm ${
                      complete ? 'border-green-500/30' : 'border-white/5 hover:border-white/10'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform shadow-lg ${
                      complete ? 'bg-green-500/10 text-green-500' : 'bg-[#1a1a1d]'
                    }`}>
                      {complete ? <ShieldCheck size={20} /> : <card.icon size={20} strokeWidth={2} />}
                    </div>
                    <div className="text-center">
                      <h4 className="text-xs font-bold text-white/90 mb-1 group-hover:text-white transition-colors">{card.title}</h4>
                      <p className={`text-[10px] font-semibold uppercase tracking-wider ${complete ? 'text-green-500/60' : 'text-white/30'}`}>
                        {complete ? 'Выполнено' : card.count}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Check Detail Modal */}
      {activeCheck && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-[#0f0f11] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-6 border-bottom border-white/5 flex items-center justify-between bg-gradient-to-r from-purple-500/10 to-transparent">
              <div>
                <h3 className="text-lg font-bold text-white">{activeCheck.title}</h3>
                <p className="text-xs text-white/40 font-medium uppercase tracking-wider mt-1">{activeCheck.shift} · Клуб {activeClub}</p>
              </div>
              <button 
                onClick={() => setActiveCheck(null)}
                className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 transition-colors"
              >
                <MoreHorizontal size={20} />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-3">
              {(CHECK_ITEMS[activeCheck.title] || []).map((item, i) => {
                const isChecked = checkedItems[`${activeCheck.title}-${i}`];
                return (
                  <label 
                    key={i}
                    className={`flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all border ${
                      isChecked ? 'bg-green-500/5 border-green-500/20' : 'bg-white/5 border-transparent hover:bg-white/10'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 transition-all ${
                      isChecked ? 'bg-green-500 border-green-500 text-white' : 'border-white/10 text-transparent'
                    }`}>
                      <ShieldCheck size={14} strokeWidth={3} />
                    </div>
                    <input 
                      type="checkbox" 
                      className="hidden"
                      checked={!!isChecked}
                      onChange={() => handleToggleItem(activeCheck.title, i)}
                    />
                    <span className={`text-sm font-medium transition-colors ${isChecked ? 'text-white/90' : 'text-white/60'}`}>
                      {item}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="p-6 bg-[#151518] border-top border-white/5 flex items-center gap-4">
              <button 
                onClick={() => setActiveCheck(null)}
                className="flex-1 py-3.5 rounded-2xl bg-white/5 text-white/60 text-sm font-bold hover:bg-white/10 transition-all"
              >
                Отмена
              </button>
              <button 
                onClick={() => setActiveCheck(null)}
                className={`flex-1 py-3.5 rounded-2xl text-sm font-bold transition-all ${
                  isCheckComplete(activeCheck.title) 
                    ? 'bg-[#7B3DFF] text-white shadow-lg shadow-purple-500/20' 
                    : 'bg-white/5 text-white/20 cursor-not-allowed'
                }`}
              >
                Подтвердить
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ChecklistPage;
