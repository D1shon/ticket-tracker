import React, { useState } from 'react';
import { 
  BookOpen, Search, HelpCircle, AlertTriangle, ShieldCheck, 
  Baby, Sparkles, ChevronDown, ChevronUp, Book, MessageSquare, 
  Calendar, CheckCircle, Smartphone, Wifi, Wrench, Package, Info
} from 'lucide-react';
import { useTickets } from '../store/TicketContext';

const SECTIONS = [
  { id: 'general', label: 'Общие правила' },
  { id: 'safety', label: 'Техника безопасности' },
  { id: 'booking', label: 'Билеты и записи' },
  { id: 'admin', label: 'Регламенты администратора' },
  { id: 'faq', label: 'Частые вопросы (FAQ)' }
];

const GUIDEBOOK_DATA = {
  general: [
    {
      icon: Baby,
      title: '1. Возрастные ограничения и дети в клубе',
      content: [
        'Посещение клуба разрешено строго с 16 лет. Это правило применяется абсолютно ко всем клиентам без исключений.',
        'Данное требование продиктовано требованиями безопасности при работе с профессиональными тренажерами и свободными весами.',
        'Администратор обязан проверять документы, удостоверяющие личность (удостоверение личности, паспорт или свидетельство о рождении), при любых сомнениях относительно возраста гостя.'
      ]
    },
    {
      icon: MessageSquare,
      title: '2. Поведение в зале и культура общения',
      content: [
        'На территории клуба категорически запрещены любые формы агрессии, разжигание конфликтов, оскорбления персонала или других участников, использование нецензурной лексики, а также чрезмерно громкие разговоры.',
        'Администратор должен тактично и вежливо делать замечания нарушителям спокойствия в зале, используя только регламентированные стандартом фразы.',
        'Пример фразы при громком шуме: «Я извиняюсь, что перебиваю вас. Пожалуйста, можно сделать ваши разговоры чуть-чуть потише? Большое спасибо за понимание!»'
      ]
    },
    {
      icon: Package,
      title: '3. Правила приноса еды',
      content: [
        'Запрещено приносить и употреблять любую еду в тренировочных зонах клуба.',
        'Единственными исключениями из этого правила являются: бананы, яблоки, протеиновые коктейли, а также специализированные протеиновые батончики.',
        'Любые другие перекусы должны осуществляться строго в специально отведенной зоне отдыха или на рецепции.'
      ]
    },
    {
      icon: AlertTriangle,
      title: '4. Животные и личные вещи',
      content: [
        'Нахождение на территории клуба с любыми домашними животными (даже ручными или в переносках) строго запрещено.',
        'Проносить спортивные сумки, рюкзаки и иные крупные личные вещи в тренировочные зоны запрещено. Все вещи должны храниться в индивидуальных шкафчиках раздевалки.'
      ]
    }
  ],
  safety: [
    {
      icon: CheckCircle,
      title: '1. Спортивная форма и обувь',
      content: [
        'Тренировки допускаются исключительно в чистой спортивной форме и закрытой сменной обуви (кроссовках).',
        'Посещение тренировочных зон в сланцах, шлепках, открытой обуви, носках или босиком строго запрещено.',
        'Тренировки без одежды (с обнаженным торсом) также категорически не допускаются.'
      ]
    },
    {
      icon: Smartphone,
      title: '2. Мобильные телефоны на беговых дорожках',
      content: [
        'Во время непосредственного выполнения упражнений (особенно во время бега или ходьбы на беговых дорожках) пользоваться мобильным телефоном запрещено.',
        'Использование гаджетов на движущихся полотнах кардио-тренажеров является частой причиной потери равновесия и получения серьезных травм.'
      ]
    },
    {
      icon: Info,
      title: '3. Наушники и жевательная резинка',
      content: [
        'Использование наушников во время выполнения упражнений высокой интенсивности не рекомендуется, а жевание жвачки во время тренировки — строго запрещено.',
        'Жвачка во время выполнения упражнений создает прямую угрозу перекрытия дыхательных путей при резком вдохе.',
        'Администратор и тренеры должны своевременно просить клиентов избавиться от жевательной резинки перед началом занятия.'
      ]
    },
    {
      icon: Sparkles,
      title: '4. Стаканчики и безопасность оборудования',
      content: [
        'В тренировочных зонах не рекомендуется использовать стаканчики с открытыми крышками (за исключением случаев приема лекарственных средств).',
        'Это связано с большим количеством электронных компонентов, проводов и дорогостоящей техники под ногами в зале. Пролитая жидкость может привести к короткому замыканию и остановке работы зала.'
      ]
    }
  ],
  booking: [
    {
      icon: Smartphone,
      title: '1. Доступ в клуб через QR-код',
      content: [
        'Доступ в тренировочные зоны и регистрация посещения осуществляются исключительно через официальное мобильное приложение по персональному QR-коду гостя.',
        'Если у клиента не работает приложение, администратор должен помочь сбросить кэш, переустановить приложение или найти профиль вручную по номеру телефона, сверив фото профиля с гостем.'
      ]
    },
    {
      icon: CheckCircle,
      title: '2. Списание билетов и бронирование',
      content: [
        'Один билет в абонементе клиента равен одному полноценному посещению.',
        'При осуществлении записи на занятие билет автоматически резервируется (бронируется). Списание происходит в момент сканирования QR-кода на входе.'
      ]
    },
    {
      icon: AlertTriangle,
      title: '3. Отмена записи и штрафные билеты',
      content: [
        'Отменить запись на тренировку без потери зарезервированного билета можно не позднее чем за 8 часов до фактического начала занятия.',
        'При более поздней отмене или неявке на занятие (пропуске) билет сгорает безвозвратно.',
        'Дополнительно клиенту начисляется 1 штрафной билет, ограничивающий возможность некоторых бронирований до его отработки.'
      ]
    },
    {
      icon: Calendar,
      title: '4. Опоздания на тренировки',
      content: [
        'При опоздании клиента более чем на 10 минут от начала занятия, дежурный тренер имеет полное право не допустить гостя до тренировки.',
        'Пропуск обязательной вводной разминки и суставного разогрева существенно повышает риск получения растяжений и травм во время основной части занятия.'
      ]
    },
    {
      icon: Info,
      title: '5. Посещение других филиалов сети',
      content: [
        'Клиенты имеют право посещать другие филиалы сети, если это предусмотрено их типом абонемента.',
        'Перед подтверждением посещения администратор на рецепции должен обязательно открыть карточку клиента и проверить условия действия текущего абонемента для сторонних локаций.'
      ]
    }
  ],
  admin: [
    {
      icon: Wrench,
      title: '1. Регламент обращения в техническую поддержку',
      content: [
        'Клиенты должны самостоятельно отправлять любые технические запросы, жалобы и пожелания через встроенный раздел обратной связи в мобильном приложении.',
        'Администратор клуба имеет право создать технический тикет со своего рабочего компьютера только в исключительном случае — когда клиент уже отправлял запрос сам, но не получил оперативного или корректного решения в течение регламентированного срока.'
      ]
    },
    {
      icon: Smartphone,
      title: '2. Запрет на использование личных телефонов',
      content: [
        'Администраторам клуба категорически запрещено вести переписку или созваниваться с клиентами по рабочим вопросам со своих личных мобильных телефонов и аккаунтов в мессенджерах.',
        'Все рабочие коммуникации должны осуществляться строго с использованием официального корпоративного телефона клуба и закрепленных за ним мессенджеров/каналов.'
      ]
    }
  ]
};

const FAQ_ITEMS = [
  {
    question: 'Как правильно добавить нового сотрудника в график?',
    answer: 'Только пользователи с ролями «Шеф» и «Менеджер» имеют права на редактирование состава персонала. Если вы авторизованы под такой ролью, перейдите во вкладку «График», выберите нужный месяц и нажмите фиолетовую кнопку «Добавить сотрудника» в нижней части таблицы. Введите имя, укажите статус и подтвердите ввод.'
  },
  {
    question: 'Почему администратору не видны оклады и финансовые итоги в графике?',
    answer: 'Согласно стандартам безопасности, для роли «Администратор» отключено отображение любых конфиденциальных финансовых колонок и строк (оклады, премии, авансы, коррекции, выплаты за развозку и общие итоги по зарплате). Администратор видит только имена сотрудников и их отработанные смены.'
  },
  {
    question: 'Что делать, если не срабатывают всплывающие окна и звуки уведомлений о тикетах?',
    answer: 'Для учетных записей администраторов фоновое прослушивание базы данных и уведомления отключены для предотвращения перегрузки интерфейса на рабочих компьютерах. Для ролей Шефа и Менеджера убедитесь, что в браузере предоставлены права на отправку push-уведомлений и воспроизведение звуков.'
  },
  {
    question: 'Как списать мерч или товар со склада по бартеру или бесплатно?',
    answer: 'Перейдите в раздел «Склад», выберите позицию и нажмите «Продать». В появившемся окне выберите тип продажи «Свободная / Бартенг». Обязательно укажите реальную причину выдачи (например, «для нужд клуба» или «бартер за услуги») для фиксации операции в логах аудита.'
  },
  {
    question: 'Как закрепить смены сотрудника за определенным фитнес-клубом?',
    answer: 'Сотрудники автоматически привязываются к тому клубу, который был выбран в верхнем фильтре в момент их добавления. Вы можете переключать клубы в шапке расписания, чтобы просматривать или распределять смены по каждому филиалу.'
  }
];

const GuidebookPage = () => {
  const { user } = useTickets();
  const [activeSection, setActiveSection] = useState('general');
  const [searchQuery, setSearchQuery] = useState('');
  const [openFaqIdx, setOpenFaqIdx] = useState(null);

  const toggleFaq = (idx) => {
    setOpenFaqIdx(openFaqIdx === idx ? null : idx);
  };

  // Filter guidebook sections based on search query
  const getFilteredData = () => {
    if (!searchQuery) return GUIDEBOOK_DATA[activeSection] || [];
    
    const query = searchQuery.toLowerCase();
    const results = [];
    
    // Search across all content in currently selected section
    const currentSectionItems = GUIDEBOOK_DATA[activeSection] || [];
    return currentSectionItems.filter(item => 
      item.title.toLowerCase().includes(query) || 
      item.content.some(paragraph => paragraph.toLowerCase().includes(query))
    );
  };

  const filteredItems = getFilteredData();

  // Filter FAQ items
  const filteredFaq = FAQ_ITEMS.filter(item => 
    item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold italic flex items-center gap-2 mb-1" style={{ color: 'var(--text-primary)' }}>
            <span style={{ color: 'var(--text-muted)' }}>
              <BookOpen size={20} strokeWidth={2.5} />
            </span>
            ГАЙДБУК АДМИНИСТРАТОРА
          </h1>
          <p className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            <span style={{ color: 'var(--accent-purple)' }}>📖</span> ВНУТРЕННИЕ РЕГЛАМЕНТЫ И СТАНДАРТЫ HERO'S JOURNEY
          </p>
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', width: '100%', maxWidth: 300 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="input-app"
            style={{ width: '100%', paddingLeft: 36, borderRadius: 12, fontSize: 13 }}
            placeholder="Поиск по регламентам..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs Menu */}
      <div 
        style={{ 
          display: 'flex', 
          gap: 8, 
          borderBottom: '1px solid var(--border)', 
          paddingBottom: 4, 
          overflowX: 'auto',
          scrollbarWidth: 'none'
        }}
      >
        {SECTIONS.map(sec => (
          <button
            key={sec.id}
            onClick={() => { setActiveSection(sec.id); setOpenFaqIdx(null); }}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeSection === sec.id ? '2px solid var(--accent-purple)' : '2px solid transparent',
              color: activeSection === sec.id ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 13,
              fontWeight: activeSection === sec.id ? 800 : 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s'
            }}
          >
            {sec.label}
          </button>
        ))}
      </div>

      {/* Content Render */}
      <div style={{ flex: 1 }}>
        {activeSection === 'faq' ? (
          /* FAQ Section View */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 800 }}>
            {filteredFaq.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
                По вашему запросу вопросов не найдено.
              </div>
            ) : (
              filteredFaq.map((item, idx) => {
                const isOpen = openFaqIdx === idx;
                return (
                  <div 
                    key={idx}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 16,
                      overflow: 'hidden',
                      transition: 'border-color 0.2s'
                    }}
                  >
                    <button
                      onClick={() => toggleFaq(idx)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px 20px',
                        background: 'transparent',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <HelpCircle size={16} style={{ color: 'var(--accent-purple)', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 800 }}>{item.question}</span>
                      </div>
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {isOpen && (
                      <div 
                        style={{
                          padding: '16px 20px 20px 48px',
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          lineHeight: 1.6,
                          borderTop: '1px solid var(--border)',
                        }}
                      >
                        {item.answer}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Regulations Section View */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 850 }}>
            {filteredItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
                В данном разделе регламентов по запросу ничего не найдено.
              </div>
            ) : (
              filteredItems.map((item, idx) => {
                const IconComponent = item.icon || Book;
                return (
                  <div 
                    key={idx}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 20,
                      padding: 24,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div 
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: 'rgba(123, 61, 255, 0.08)',
                          color: 'var(--accent-purple)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        <IconComponent size={18} />
                      </div>
                      <h3 style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)' }}>
                        {item.title}
                      </h3>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 4 }}>
                      {item.content.map((para, pIdx) => (
                        <p 
                          key={pIdx} 
                          style={{ 
                            fontSize: 13, 
                            color: 'var(--text-secondary)', 
                            lineHeight: 1.6, 
                            position: 'relative',
                            paddingLeft: 16
                          }}
                        >
                          <span 
                            style={{ 
                              position: 'absolute', 
                              left: 0, 
                              top: 8, 
                              width: 6, 
                              height: 6, 
                              borderRadius: '50%', 
                              background: 'var(--accent-purple)',
                              opacity: 0.7 
                            }} 
                          />
                          {para}
                        </p>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GuidebookPage;
