import React, { useState, useEffect, useMemo } from 'react';
import { 
  BookOpen, Search, HelpCircle, AlertTriangle, ShieldCheck, 
  Baby, Sparkles, ChevronDown, ChevronUp, Book, MessageSquare, 
  Calendar, CheckCircle, Smartphone, Wifi, Wrench, Package, Info, Loader2,
  ArrowLeft, Clock, Layers, FileText
} from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

const SECTIONS = [
  { id: 'Introduction', label: 'Введение и основы' },
  { id: 'Communication', label: 'Коммуникация' },
  { id: 'Critical Situations', label: 'Критические ситуации' },
  { id: 'Behavior', label: 'Стандарты поведения' },
  { id: 'faq', label: 'Частые вопросы (FAQ)' }
];

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

const getTopicIcon = (title) => {
  const t = title.toLowerCase();
  if (t.includes('общие') || t.includes('роль')) return BookOpen;
  if (t.includes('клиент') || t.includes('сервис') || t.includes('общени')) return MessageSquare;
  if (t.includes('правила') || t.includes('клуб') || t.includes('чп') || t.includes('безопасн')) return ShieldCheck;
  if (t.includes('скрипт') || t.includes('телефон')) return Smartphone;
  if (t.includes('абонемент') || t.includes('продукт')) return Package;
  if (t.includes('билет') || t.includes('посещен')) return Calendar;
  if (t.includes('термин') || t.includes('словар')) return Info;
  if (t.includes('нестандарт') || t.includes('проблем')) return AlertTriangle;
  if (t.includes('конфликт') || t.includes('жалоб')) return AlertTriangle;
  if (t.includes('поддержк')) return Wrench;
  if (t.includes('команд') || t.includes('взаимодейств')) return MessageSquare;
  if (t.includes('assessment')) return Sparkles;
  if (t.includes('reshape')) return Sparkles;
  if (t.includes('метрик') || t.includes('геймификац')) return Sparkles;
  return Book;
};

const GuidebookPage = () => {
  const { user } = useTickets();
  const [activeSection, setActiveSection] = useState('Introduction');
  const [searchQuery, setSearchQuery] = useState('');
  const [openFaqIdx, setOpenFaqIdx] = useState(null);
  
  // Data State
  const [guidebookData, setGuidebookData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Responsive / Reading State
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState('list'); // 'list' or 'detail'
  const [selectedTopicId, setSelectedTopicId] = useState(null);

  // Monitor screen resizing for layout adjustment
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch Guidebook
  useEffect(() => {
    const fetchGuidebook = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'guidebook'));
        const data = querySnapshot.docs.map(doc => doc.data());
        const sortedData = data.sort((a, b) => {
          const matchA = a.title.match(/^\d+/);
          const matchB = b.title.match(/^\d+/);
          const numA = matchA ? parseInt(matchA[0], 10) : 999;
          const numB = matchB ? parseInt(matchB[0], 10) : 999;
          return numA - numB;
        });
        setGuidebookData(sortedData);
      } catch (err) {
        console.error('Error fetching guidebook:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchGuidebook();
  }, []);

  // Set initial selected topic when active section or data changes
  useEffect(() => {
    const sectionItems = guidebookData.filter(item => item.section === activeSection);
    if (sectionItems.length > 0) {
      setSelectedTopicId(sectionItems[0].id);
    } else {
      setSelectedTopicId(null);
    }
    setMobileView('list');
  }, [activeSection, guidebookData]);

  // Filter Guidebook Sections
  const getFilteredData = () => {
    const sectionItems = guidebookData.filter(item => item.section === activeSection);
    if (!searchQuery) return sectionItems;
    
    const query = searchQuery.toLowerCase();
    return sectionItems.filter(item => 
      item.title.toLowerCase().includes(query) || 
      (item.subsection && item.subsection.toLowerCase().includes(query)) ||
      (item.blocks && item.blocks.some(block => block.text && block.text.toLowerCase().includes(query)))
    );
  };

  const filteredItems = getFilteredData();

  // Handle auto-selection adjustment if filtered items change during search
  useEffect(() => {
    if (filteredItems.length > 0) {
      const isSelectedInFiltered = filteredItems.some(item => item.id === selectedTopicId);
      if (!isSelectedInFiltered) {
        setSelectedTopicId(filteredItems[0].id);
      }
    }
  }, [searchQuery, filteredItems, selectedTopicId]);

  const activeTopic = useMemo(() => {
    return guidebookData.find(item => item.id === selectedTopicId) || null;
  }, [selectedTopicId, guidebookData]);

  // Calculate reading time for the active topic
  const activeTopicReadingStats = useMemo(() => {
    if (!activeTopic || !activeTopic.blocks) return { words: 0, time: 1 };
    const words = activeTopic.blocks.reduce((acc, b) => acc + (b.text ? b.text.split(/\s+/).length : 0), 0);
    const time = Math.max(1, Math.ceil(words / 130)); // 130 wpm reading rate
    return { words, time };
  }, [activeTopic]);

  const filteredFaq = FAQ_ITEMS.filter(item => 
    item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleFaq = (idx) => {
    setOpenFaqIdx(openFaqIdx === idx ? null : idx);
  };

  // Modern Dynamic Notion Block Renderer
  const renderBlocks = (blocks) => {
    if (!blocks || blocks.length === 0) return null;

    return blocks.map((block, idx) => {
      const text = block.text || '';
      
      // Callout Check (Checks for specific emojis or rules warning symbols)
      const isCalloutGreen = text.startsWith('✅') || text.startsWith('🟢');
      const isCalloutYellow = text.startsWith('⚠️') || text.startsWith('💡') || text.startsWith('⚡');
      const isCalloutRed = text.startsWith('‼️') || text.startsWith('❌') || text.startsWith('🔴');
      
      if (isCalloutGreen || isCalloutYellow || isCalloutRed) {
        let bgColor = 'rgba(16, 185, 129, 0.05)';
        let borderColor = 'rgba(16, 185, 129, 0.3)';
        let textColor = 'var(--text-secondary)';
        
        if (isCalloutYellow) {
          bgColor = 'rgba(245, 158, 11, 0.05)';
          borderColor = 'rgba(245, 158, 11, 0.3)';
        } else if (isCalloutRed) {
          bgColor = 'rgba(239, 68, 68, 0.05)';
          borderColor = 'rgba(239, 68, 68, 0.3)';
        }
        
        return (
          <div 
            key={idx}
            style={{
              background: bgColor,
              borderLeft: `4px solid ${borderColor}`,
              padding: '16px 20px',
              borderRadius: '0 16px 16px 0',
              margin: '16px 0',
              fontSize: '13.5px',
              lineHeight: 1.7,
              color: textColor,
              fontWeight: 500,
              boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
            }}
          >
            {text}
          </div>
        );
      }

      // Headers Styling
      if (block.type === 'header') {
        return (
          <h2 
            key={idx} 
            style={{ 
              fontSize: '18px', 
              fontWeight: 900, 
              color: 'var(--text-primary)', 
              marginTop: '28px', 
              marginBottom: '12px',
              paddingBottom: '8px',
              borderBottom: '1px solid var(--border)',
              letterSpacing: '-0.02em',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <span style={{ width: 4, height: 16, background: 'var(--accent-purple)', borderRadius: 2 }} />
            {text}
          </h2>
        );
      }
      if (block.type === 'sub_header') {
        return (
          <h3 
            key={idx} 
            style={{ 
              fontSize: '15px', 
              fontWeight: 800, 
              color: 'var(--text-primary)', 
              marginTop: '22px', 
              marginBottom: '8px' 
            }}
          >
            {text}
          </h3>
        );
      }
      if (block.type === 'sub_sub_header') {
        return (
          <h4 
            key={idx} 
            style={{ 
              fontSize: '13.5px', 
              fontWeight: 800, 
              color: 'var(--text-primary)', 
              marginTop: '18px', 
              marginBottom: '6px' 
            }}
          >
            {text}
          </h4>
        );
      }

      // Styled list items
      if (block.type === 'bulleted_list' || block.type === 'numbered_list') {
        return (
          <div 
            key={idx} 
            style={{ 
              display: 'flex', 
              gap: 12, 
              alignItems: 'flex-start',
              margin: '8px 0',
              fontSize: '13.5px', 
              color: 'var(--text-secondary)', 
              lineHeight: 1.7,
              paddingLeft: '8px'
            }}
          >
            <span 
              style={{ 
                width: 6, 
                height: 6, 
                borderRadius: '50%', 
                background: 'var(--accent-purple)', 
                marginTop: '10px',
                flexShrink: 0,
                boxShadow: '0 0 8px var(--accent-purple)'
              }} 
            />
            <span>{text}</span>
          </div>
        );
      }

      // Dialogues / Script lines
      const isDialogue = text.startsWith('—') || text.startsWith('«') || (text.includes(':') && text.indexOf(':') < 20 && /^[A-ZА-Я]/.test(text));
      if (isDialogue) {
        return (
          <p 
            key={idx} 
            style={{ 
              fontSize: '13.5px', 
              color: 'var(--text-primary)', 
              lineHeight: 1.7, 
              margin: '10px 0',
              fontStyle: 'italic',
              background: 'rgba(123, 61, 255, 0.03)',
              padding: '10px 16px',
              borderRadius: '12px',
              borderLeft: '3px solid var(--accent-purple)',
              fontFamily: 'monospace, sans-serif'
            }}
          >
            {text}
          </p>
        );
      }

      // Regular Paragraphs
      return (
        <p 
          key={idx} 
          style={{ 
            fontSize: '13.5px', 
            color: 'var(--text-secondary)', 
            lineHeight: 1.7, 
            margin: '10px 0',
            letterSpacing: '0.01em'
          }}
        >
          {text}
        </p>
      );
    });
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
        <Loader2 className="animate-spin" size={32} style={{ color: 'var(--accent-purple)' }} />
        <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Загрузка гайдбука...</span>
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>
      
      {/* Dynamic Scss/Css styles inside page */}
      <style>{`
        .guidebook-tab {
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .guidebook-tab:hover {
          color: var(--text-primary) !important;
          background: rgba(255, 255, 255, 0.02);
        }
        .topic-card {
          transition: all 0.2s ease;
        }
        .topic-card:hover {
          transform: translateY(-2px);
          border-color: rgba(123, 61, 255, 0.25) !important;
          background: rgba(123, 61, 255, 0.02) !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
        }
        .topic-card.active {
          background: rgba(123, 61, 255, 0.08) !important;
          border-color: var(--accent-purple) !important;
          box-shadow: 0 4px 15px rgba(123, 61, 255, 0.08);
        }
        .faq-card {
          transition: all 0.2s ease;
        }
        .faq-card:hover {
          border-color: rgba(123, 61, 255, 0.25) !important;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: var(--text-muted);
        }
      `}</style>

      {/* Modern Banner/Header Panel */}
      <div 
        style={{ 
          background: 'linear-gradient(135deg, rgba(123, 61, 255, 0.05) 0%, rgba(123, 61, 255, 0.01) 100%)',
          border: '1px solid var(--border)',
          borderRadius: 24,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}
      >
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'between', alignItems: isMobile ? 'flex-start' : 'center', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <h1 className="text-xl font-black italic flex items-center gap-2 mb-1" style={{ color: 'var(--text-primary)', margin: 0 }}>
              <span style={{ color: 'var(--accent-purple)' }}>
                <BookOpen size={22} strokeWidth={2.5} />
              </span>
              ГАЙДБУК АДМИНИСТРАТОРА
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--text-muted)' }}>
              🎯 база знаний, стандарты обслуживания и регламенты безопасности
            </p>
          </div>

          {/* Clean Search Input */}
          <div style={{ position: 'relative', width: '100%', maxWidth: isMobile ? '100%' : 320 }}>
            <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="input-app"
              style={{ width: '100%', paddingLeft: 40, paddingRight: searchQuery ? 32 : 12, borderRadius: 14, fontSize: 13, height: 40 }}
              placeholder="Поиск по регламентам..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 'bold'
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Mini stats dashboard */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, pt: 16, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Layers size={13} style={{ color: 'var(--accent-purple)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
              Тем: {guidebookData.length}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileText size={13} style={{ color: 'var(--accent-purple)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
              Категорий: 4
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={13} style={{ color: 'var(--accent-purple)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
              Среднее время чтения: ~5 мин
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Pill Navigation */}
      <div 
        style={{ 
          display: 'flex', 
          gap: 8, 
          borderBottom: '1px solid var(--border)', 
          paddingBottom: 8, 
          overflowX: 'auto',
          scrollbarWidth: 'none'
        }}
        className="custom-scrollbar"
      >
        {SECTIONS.map(sec => {
          const isActive = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => { setActiveSection(sec.id); setOpenFaqIdx(null); }}
              style={{
                padding: '8px 16px',
                background: isActive ? 'var(--accent-purple)' : 'rgba(255, 255, 255, 0.01)',
                border: '1px solid ' + (isActive ? 'var(--accent-purple)' : 'var(--border)'),
                borderRadius: 12,
                color: isActive ? '#fff' : 'var(--text-muted)',
                fontSize: 13,
                fontWeight: isActive ? 800 : 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: isActive ? '0 4px 10px rgba(123, 61, 255, 0.15)' : 'none'
              }}
              className="guidebook-tab"
            >
              {sec.label}
            </button>
          );
        })}
      </div>

      {/* Split/Regular Layout Content Pane */}
      <div style={{ flex: 1 }}>
        {activeSection === 'faq' ? (
          /* FAQ Section Accordions */
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
                      border: '1px solid ' + (isOpen ? 'var(--accent-purple)' : 'var(--border)'),
                      borderRadius: 16,
                      overflow: 'hidden',
                      boxShadow: isOpen ? '0 4px 15px rgba(123, 61, 255, 0.04)' : 'none'
                    }}
                    className="faq-card"
                  >
                    <button
                      onClick={() => toggleFaq(idx)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '18px 24px',
                        background: 'transparent',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <HelpCircle size={16} style={{ color: 'var(--accent-purple)', flexShrink: 0 }} />
                        <span style={{ fontSize: 13.5, fontWeight: 800 }}>{item.question}</span>
                      </div>
                      {isOpen ? <ChevronUp size={16} style={{ color: 'var(--accent-purple)' }} /> : <ChevronDown size={16} />}
                    </button>

                    {isOpen && (
                      <div 
                        style={{
                          padding: '16px 24px 24px 52px',
                          fontSize: 13,
                          color: 'var(--text-secondary)',
                          lineHeight: 1.7,
                          borderTop: '1px solid var(--border)',
                          background: 'rgba(255, 255, 255, 0.005)'
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
          /* Split layout for regulations: Left (topics list), Right (detailed reading pane) */
          <div>
            {filteredItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 20 }}>
                В данном разделе регламентов по запросу ничего не найдено.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '300px 1fr', gap: 24, alignItems: 'start' }}>
                
                {/* Left pane: list of topics */}
                {(!isMobile || mobileView === 'list') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '65vh', overflowY: 'auto', paddingRight: 4 }} className="custom-scrollbar">
                    {filteredItems.map((item) => {
                      const isSelected = item.id === selectedTopicId;
                      const Icon = getTopicIcon(item.title);
                      
                      // Calculate short estimate of blocks
                      const textBlockCount = item.blocks ? item.blocks.filter(b => b.type === 'text' || b.type === 'bulleted_list').length : 0;
                      
                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            setSelectedTopicId(item.id);
                            if (isMobile) setMobileView('detail');
                          }}
                          className={`topic-card ${isSelected ? 'active' : ''}`}
                          style={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: 16,
                            padding: 16,
                            cursor: 'pointer',
                            display: 'flex',
                            gap: 12,
                            alignItems: 'flex-start'
                          }}
                        >
                          <div 
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              background: isSelected ? 'rgba(123, 61, 255, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                              color: isSelected ? 'var(--accent-purple)' : 'var(--text-muted)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            <Icon size={16} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <h4 style={{ fontSize: 13, fontWeight: isSelected ? 800 : 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.4 }}>
                              {item.title}
                            </h4>
                            <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', marginTop: 6 }}>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'inline-block', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.subsection || 'Общее'}
                              </span>
                              <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, background: 'rgba(255,255,255,0.03)', padding: '2px 6px', borderRadius: 4 }}>
                                {textBlockCount} абз.
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Right pane: detailed article view */}
                {(!isMobile || mobileView === 'detail') && activeTopic && (
                  <div 
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 24,
                      padding: isMobile ? '20px' : '32px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 20,
                      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)'
                    }}
                  >
                    {/* Header bar on mobile to return to list */}
                    {isMobile && (
                      <button
                        onClick={() => setMobileView('list')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: '6px 12px',
                          color: 'var(--text-secondary)',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          alignSelf: 'flex-start',
                          marginBottom: 10
                        }}
                      >
                        <ArrowLeft size={14} /> Назад к списку
                      </button>
                    )}

                    {/* Article Info Header */}
                    <div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                        <span 
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            background: 'rgba(123, 61, 255, 0.08)',
                            color: 'var(--accent-purple)',
                            padding: '4px 10px',
                            borderRadius: 6,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                          }}
                        >
                          {SECTIONS.find(s => s.id === activeTopic.section)?.label || activeTopic.section}
                        </span>
                        
                        <span 
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            background: 'rgba(255, 255, 255, 0.03)',
                            color: 'var(--text-muted)',
                            padding: '4px 10px',
                            borderRadius: 6,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <Clock size={11} /> {activeTopicReadingStats.time} мин чтения
                        </span>
                      </div>

                      <h1 
                        style={{ 
                          fontSize: isMobile ? 18 : 22, 
                          fontWeight: 900, 
                          color: 'var(--text-primary)', 
                          margin: 0, 
                          lineHeight: 1.3,
                          letterSpacing: '-0.02em'
                        }}
                      >
                        {activeTopic.title}
                      </h1>
                      
                      {activeTopic.subsection && (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '8px 0 0 0', fontWeight: 600 }}>
                          Подраздел: {activeTopic.subsection}
                        </p>
                      )}
                    </div>

                    <div style={{ width: '100%', height: 1, background: 'var(--border)' }} />

                    {/* Rendered Text Body */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {renderBlocks(activeTopic.blocks)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GuidebookPage;
