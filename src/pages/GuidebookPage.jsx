import React, { useState } from 'react';
import { 
  BookOpen, ExternalLink, Calendar, TrendingUp, 
  Wrench, Wifi, Package, ShieldAlert, HelpCircle, 
  ChevronDown, ChevronUp, ArrowRight
} from 'lucide-react';
import { useTickets } from '../store/TicketContext';

const NOTION_GUIDEBOOK_URL = "https://www.notion.so/346ff702d87b80a7ab03fa77c144ecf6?v=346ff702d87b80dbaf42000cd8969906";

const CATEGORIES = [
  {
    icon: Calendar,
    color: '#7B3DFF',
    title: 'Смены и графики',
    desc: 'Правила заполнения табелей, открытие и закрытие смен, учет рабочего времени и чек-листы.',
    link: NOTION_GUIDEBOOK_URL
  },
  {
    icon: TrendingUp,
    color: '#10B981',
    title: 'Продажи и оплаты',
    desc: 'Инструкции по продаже абонементов, учет кассовых смен, внесение платежей и возвраты.',
    link: NOTION_GUIDEBOOK_URL
  },
  {
    icon: Wrench,
    color: '#F59E0B',
    title: 'Технический регламент',
    desc: 'Регламент исправления технических неполадок, создание заявок и обращение в поддержку.',
    link: NOTION_GUIDEBOOK_URL
  },
  {
    icon: Wifi,
    color: '#3B82F6',
    title: 'Чекин и Wi-Fi агент',
    desc: 'Инструкции по отслеживанию посещаемости тренеров и персонала через Wi-Fi трекер.',
    link: NOTION_GUIDEBOOK_URL
  },
  {
    icon: Package,
    color: '#EC4899',
    title: 'Склад и Мерч',
    desc: 'Поступление товаров на склад, проведение инвентаризации, списание и продажа мерча.',
    link: NOTION_GUIDEBOOK_URL
  },
  {
    icon: ShieldAlert,
    color: '#EF4444',
    title: 'Безопасность и роли',
    desc: 'Управление доступом, разграничение прав для шеф-поваров, менеджеров и администраторов.',
    link: NOTION_GUIDEBOOK_URL
  }
];

const FAQ_ITEMS = [
  {
    question: 'Как добавить нового сотрудника в график?',
    answer: 'Только сотрудники с ролями «Шеф» и «Менеджер» имеют право изменять список персонала. Для добавления перейдите в раздел «График», нажмите фиолетовую кнопку «+ Добавить» внизу таблицы, введите имя сотрудника и нажмите Enter.'
  },
  {
    question: 'Почему у администратора не отображаются суммы окладов в графике?',
    answer: 'Согласно настройкам безопасности платформы, для роли «Администратор» отключен показ любых финансовых полей (оклады, развозка, авансы, фиксы и итоговые выплаты). Администратор видит только отработанные смены и часы сотрудников.'
  },
  {
    question: 'Что делать, если не приходят фоновые уведомления о новых тикетах?',
    answer: 'Уведомления и подписки на обновления тикетов отключены для роли «Администратор», чтобы избежать спама на рабочих местах. Если вы зашли под учетной записью Шефа или Менеджера, убедитесь, что в браузере разрешены push-уведомления для нашего сайта.'
  },
  {
    question: 'Как зафиксировать списание мерча для личного пользования или по бартеру?',
    answer: 'Перейдите в раздел «Склад», найдите нужный товар и нажмите кнопку «Продать». В открывшемся окне переключите тип продажи на «Свободная / Бартенг», обязательно выберите причину (например, «Подарок сотруднику» или «Бартер») и сохраните продажу.'
  },
  {
    question: 'Как привязать смену сотрудника к конкретному клубу?',
    answer: 'При добавлении нового сотрудника система автоматически закрепляет его за выбранным в шапке клубом. Вы также можете переключать клубы в фильтре графика, чтобы увидеть расписание смен для каждого клуба отдельно.'
  }
];

const GuidebookPage = () => {
  const { user } = useTickets();
  const [openFaqIdx, setOpenFaqIdx] = useState(null);

  const handleOpenNotion = () => {
    window.open(NOTION_GUIDEBOOK_URL, '_blank', 'noopener,noreferrer');
  };

  const toggleFaq = (idx) => {
    setOpenFaqIdx(openFaqIdx === idx ? null : idx);
  };

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 28, paddingBottom: 40 }}>
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold italic flex items-center gap-2 mb-1" style={{ color: 'var(--text-primary)' }}>
          <span style={{ color: 'var(--text-muted)' }}>
            <BookOpen size={20} strokeWidth={2.5} />
          </span>
          ГАЙДБУК АДМИНИСТРАТОРА
        </h1>
        <p className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
          <span style={{ color: 'var(--accent-purple)' }}>📚</span> БАЗА ЗНАНИЙ HERO'S JOURNEY
        </p>
      </div>

      {/* Hero Banner Card */}
      <div 
        style={{
          background: 'linear-gradient(135deg, rgba(123, 61, 255, 0.15) 0%, rgba(251, 143, 65, 0.05) 100%)',
          border: '1px solid rgba(123, 61, 255, 0.25)',
          borderRadius: 24,
          padding: '32px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div style={{ position: 'absolute', right: -20, bottom: -20, opacity: 0.03, color: '#fff' }}>
          <BookOpen size={240} />
        </div>
        
        <div style={{ maxWidth: 650 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 10 }}>
            Интерактивный справочник Notion
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Добро пожаловать в официальную базу знаний HJ! Здесь собраны все регламенты, пошаговые инструкции, 
            скрипты общения с клиентами и стандарты работы для администраторов клубов. Справочник постоянно обновляется.
          </p>
        </div>

        <div>
          <button 
            onClick={handleOpenNotion}
            style={{
              background: 'var(--accent-purple)',
              color: 'white',
              border: 'none',
              borderRadius: 14,
              padding: '14px 24px',
              fontSize: 13,
              fontWeight: 900,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 8px 20px rgba(123, 61, 255, 0.25)',
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 10px 24px rgba(123, 61, 255, 0.35)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(123, 61, 255, 0.25)';
            }}
          >
            Открыть базу знаний в Notion
            <ExternalLink size={16} />
          </button>
        </div>
      </div>

      {/* Guidebook Categories Grid */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
          Разделы регламентов
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {CATEGORIES.map((cat, idx) => {
            const IconComponent = cat.icon;
            return (
              <div 
                key={idx}
                onClick={handleOpenNotion}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 20,
                  padding: 24,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                className="guidebook-card"
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.borderColor = cat.color;
                  e.currentTarget.style.boxShadow = `0 12px 30px rgba(0, 0, 0, 0.15)`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Visual Glow Indicator */}
                <div 
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: 4,
                    height: '100%',
                    background: cat.color
                  }}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div 
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: `${cat.color}15`,
                      color: cat.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <IconComponent size={18} />
                  </div>
                  <h4 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                    {cat.title}
                  </h4>
                </div>

                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {cat.desc}
                </p>

                <div 
                  style={{ 
                    marginTop: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-muted)'
                  }}
                >
                  Читать подробнее <ArrowRight size={12} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Interactive FAQ Section */}
      <div style={{ maxWidth: 800 }}>
        <h3 style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
          Часто задаваемые вопросы (FAQ)
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FAQ_ITEMS.map((item, idx) => {
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
                    padding: '18px 20px',
                    background: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    color: 'var(--text-primary)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <HelpCircle size={16} style={{ color: 'var(--accent-purple)' }} />
                    <span style={{ fontSize: 13, fontWeight: 800 }}>{item.question}</span>
                  </div>
                  {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {isOpen && (
                  <div 
                    style={{
                      padding: '0 20px 20px 48px',
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.6,
                      borderTop: '1px solid var(--border)',
                      paddingTop: 16
                    }}
                  >
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default GuidebookPage;
