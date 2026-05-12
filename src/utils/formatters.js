/**
 * Formats a raw author string (like an email) into a friendly Name (Position) string.
 */
export const formatAuthor = (rawAuthor) => {
  if (!rawAuthor) return 'Пользователь';
  
  // If it's a user object, extract email
  const email = (typeof rawAuthor === 'object' ? rawAuthor.email : rawAuthor).toLowerCase();
  
  // Mapping based on user requests and roles
  if (email === 'dilshat.r@hj.fit' || email.includes('chef') || email === 'sales5@example.com') {
    return 'Дильшат (CHEF)';
  }
  
  // Manager mappings
  const managers = {
    'sania': 'Сания (Менеджер)',
    'anastasia': 'Анастасия (Менеджер)',
    'dias': 'Диас (Менеджер)',
    'saltanat': 'Салтанат (Менеджер)',
    'dilshat': 'Дилшат (Менеджер)',
    'ainur': 'Айнур (Менеджер)',
    'aziz': 'Азиз (Менеджер)'
  };

  for (const [key, label] of Object.entries(managers)) {
    if (email.includes(key)) return label;
  }

  // If it's an email but not mapped, try to prettify it
  if (email.includes('@')) {
    const namePart = email.split('@')[0];
    return namePart.charAt(0).toUpperCase() + namePart.slice(1);
  }

  return rawAuthor;
};
