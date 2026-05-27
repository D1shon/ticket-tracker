const calculateHours = (timeRange) => {
  if (!timeRange) return 0;
  const cleanRange = String(timeRange).trim().replace('.', ':');
  if (!cleanRange.includes('-') && !cleanRange.includes(':')) {
    const num = parseFloat(cleanRange.replace(',', '.'));
    return isNaN(num) ? 0 : num;
  }
  try {
    if (cleanRange.includes('-')) {
      const parts = cleanRange.split('-');
      const parseTime = (s) => {
        let c = s.trim();
        if (!c.includes(':')) return (parseInt(c) || 0) * 60;
        let [h, m] = c.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
      };
      let diff = parseTime(parts[1]) - parseTime(parts[0]);
      if (diff < 0) diff += 1440;
      return parseFloat((diff / 60).toFixed(2));
    }
  } catch { return 0; }
  return 0;
};

const testValues = [
  "8:30-21:30",
  "14:30-22:30",
  "14:30 - 17:30",
  "16:00 - 20:00",
  "8:30 - 20:30",
  "6:30-14:30",
  "8",
  "выходной"
];

testValues.forEach(val => {
  console.log(`Value: "${val}" -> Calculated Hours: ${calculateHours(val)}`);
});
