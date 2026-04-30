import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  setDoc, 
  doc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useTickets } from './TicketContext';
import { toast } from 'sonner';

const ScheduleContext = createContext();

export const useSchedule = () => useContext(ScheduleContext);

export const ScheduleProvider = ({ children }) => {
  const { user } = useTickets();
  const [scheduleData, setScheduleData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'schedules'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = {};
      snapshot.docs.forEach(doc => {
        data[doc.id] = doc.data();
      });
      setScheduleData(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const updateCell = async (monthKey, employeeId, day, value) => {
    try {
      const docId = `${monthKey}_${employeeId}`;
      const existingData = scheduleData[docId] || {};
      
      await setDoc(doc(db, 'schedules', docId), {
        ...existingData,
        employeeId,
        monthKey,
        days: {
          ...(existingData.days || {}),
          [day]: value
        },
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error updating schedule:", error);
      toast.error("Ошибка сохранения графика");
    }
  };

  return (
    <ScheduleContext.Provider value={{
      scheduleData,
      loading,
      updateCell
    }}>
      {children}
    </ScheduleContext.Provider>
  );
};
