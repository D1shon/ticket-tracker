import React, { useState } from 'react';
import { 
  CheckSquare, 
  ListTodo, 
  Plus, 
  MoreHorizontal, 
  Clock, 
  ArrowLeft,
  Sparkles,
  ClipboardCheck
} from 'lucide-react';

const initialCategories = [
  { id: 'cleaning', title: 'Чек-лист по уборке', icon: Sparkles, color: 'blue', description: 'Ежедневные процедуры поддержания чистоты' },
  { id: 'opening', title: 'Открытие смены', icon: Clock, color: 'green', description: 'Задачи для подготовки к рабочему дню' },
  { id: 'closing', title: 'Закрытие смены', icon: CheckSquare, color: 'purple', description: 'Финальные задачи перед уходом' },
];

const initialTasks = {
  cleaning: [
    { id: 1, text: 'Протереть рабочие столы', completed: false },
    { id: 2, text: 'Вынести мусор', completed: false },
    { id: 3, text: 'Проверить наличие расходников в уборной', completed: false },
    { id: 4, text: 'Влажная уборка полов', completed: false },
  ],
  opening: [
    { id: 5, text: 'Включить основное оборудование', completed: false },
    { id: 6, text: 'Проверить наличие связи и интернета', completed: false },
    { id: 7, text: 'Загрузить кассовый терминал', completed: false },
  ],
  closing: [
    { id: 8, text: 'Снять Z-отчет', completed: false },
    { id: 9, text: 'Выключить все компьютеры', completed: false },
    { id: 10, text: 'Поставить помещение на сигнализацию', completed: false },
  ]
};

const ChecklistPage = () => {
  const [activeCategory, setActiveCategory] = useState(null);
  const [tasks, setTasks] = useState(initialTasks);
  const [newItemText, setNewItemText] = useState('');

  const toggleItem = (categoryId, taskId) => {
    setTasks(prev => ({
      ...prev,
      [categoryId]: prev[categoryId].map(item => 
        item.id === taskId ? { ...item, completed: !item.completed } : item
      )
    }));
  };

  const addItem = (e) => {
    e.preventDefault();
    if (!newItemText.trim() || !activeCategory) return;

    const newItem = {
      id: Date.now(),
      text: newItemText,
      completed: false
    };

    setTasks(prev => ({
      ...prev,
      [activeCategory]: [...(prev[activeCategory] || []), newItem]
    }));
    setNewItemText('');
  };

  // Вид: Список всех чек-листов (Карточки)
  if (!activeCategory) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-foreground">Все чек-листы</h1>
          <p className="text-muted-foreground">Выберите нужный список задач для выполнения</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
          {initialCategories.map(cat => {
            const currentTasks = tasks[cat.id] || [];
            const completed = currentTasks.filter(t => t.completed).length;
            const total = currentTasks.length;
            const progress = total > 0 ? (completed / total) * 100 : 0;

            return (
              <div 
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className="glass p-6 rounded-2xl cursor-pointer hover:border-primary/50 transition-all group relative overflow-hidden"
              >
                <div className={`absolute -right-4 -top-4 w-24 h-24 bg-${cat.color}-500/10 rounded-full blur-2xl group-hover:bg-${cat.color}-500/20 transition-all`}></div>
                <div className="flex items-center gap-4 mb-4">
                  <div className={`p-3 rounded-xl bg-${cat.color}-500/10 text-${cat.color}-500`}>
                    <cat.icon size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">{cat.title}</h3>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-6 line-clamp-2 min-h-[40px]">
                  {cat.description}
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium text-muted-foreground">
                    <span>Прогресс</span>
                    <span>{completed} / {total}</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${progress === 100 ? 'bg-green-500' : 'bg-primary'}`}
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Вид: Внутри конкретного чек-листа
  const categoryData = initialCategories.find(c => c.id === activeCategory);
  const currentItems = tasks[activeCategory] || [];
  const completedCount = currentItems.filter(i => i.completed).length;
  const progress = currentItems.length > 0 ? (completedCount / currentItems.length) * 100 : 0;

  return (
    <div className="space-y-6 animate-in slide-in-from-right-8 duration-500">
      <button 
        onClick={() => setActiveCategory(null)}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4 px-2 py-1 rounded-lg hover:bg-muted/50"
      >
        <ArrowLeft size={18} />
        Назад к спискам
      </button>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-${categoryData.color}-500/10 text-${categoryData.color}-500`}>
            <categoryData.icon size={24} />
          </div>
          <h1 className="text-3xl font-bold text-foreground">{categoryData.title}</h1>
        </div>
        <p className="text-muted-foreground mt-2">{categoryData.description}</p>
      </div>

      <div className="glass p-6 rounded-2xl mt-6 border-t-4" style={{ borderTopColor: 'var(--primary)' }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Список задач</h2>
          <span className="text-sm font-medium bg-muted px-3 py-1 rounded-lg">
            {completedCount} / {currentItems.length} выполнено
          </span>
        </div>

        <div className="w-full h-2 bg-muted rounded-full mb-8 overflow-hidden">
          <div 
            className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          ></div>
        </div>

        <div className="space-y-3">
          {currentItems.map((item) => (
            <div 
              key={item.id} 
              className={`
                flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer group
                ${item.completed 
                  ? 'bg-primary/5 border-primary/20 text-muted-foreground line-through' 
                  : 'bg-muted/30 border-border/50 hover:border-primary/30 text-foreground'
                }
              `}
              onClick={() => toggleItem(activeCategory, item.id)}
            >
              <div className="flex items-center gap-4">
                <div className={`
                  w-6 h-6 rounded flex items-center justify-center transition-all border
                  ${item.completed 
                    ? 'bg-primary border-primary text-white' 
                    : 'border-muted-foreground/30 group-hover:border-primary/50'
                  }
                `}>
                  {item.completed && <CheckSquare size={14} />}
                </div>
                <span className="text-sm font-medium">{item.text}</span>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={addItem} className="mt-8 pt-6 border-t border-border flex items-center gap-3">
          <input
            type="text"
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            placeholder="Добавить новую задачу в этот список..."
            className="flex-1 bg-muted/50 border border-border rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/50 transition-all text-foreground"
          />
          <button 
            type="submit"
            disabled={!newItemText.trim()}
            className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-white p-3 rounded-xl transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={20} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChecklistPage;
