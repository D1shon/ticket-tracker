import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  setDoc, 
  doc, 
  serverTimestamp,
  deleteDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useTickets } from './TicketContext';
import { toast } from 'sonner';

const ScheduleContext = createContext();

export const useSchedule = () => useContext(ScheduleContext);

export const ScheduleProvider = ({ children }) => {
  const { user } = useTickets();
  const [scheduleData, setScheduleData] = useState({});
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch Schedules
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'schedules'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = {};
      snapshot.docs.forEach(doc => {
        data[doc.id] = doc.data();
      });
      setScheduleData(data);
    });

    return () => unsubscribe();
  }, [user]);

  // Fetch Employees
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'employees'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployees(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const addEmployee = async (name) => {
    try {
      const id = Math.random().toString(36).substr(2, 9);
      await setDoc(doc(db, 'employees', id), {
        name,
        role: 'Сотрудник',
        createdAt: serverTimestamp()
      });
      toast.success("Сотрудник добавлен");
    } catch (e) {
      toast.error("Ошибка добавления");
    }
  };

  const removeEmployee = async (id) => {
    try {
      await deleteDoc(doc(db, 'employees', id));
      toast.success("Сотрудник удален");
    } catch (e) {
      toast.error("Ошибка удаления");
    }
  };

  const updateEmployee = async (id, name) => {
    try {
      await updateDoc(doc(db, 'employees', id), { name });
    } catch (e) {
      toast.error("Ошибка обновления");
    }
  };

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
    }
  };

  const updateAdvance = async (monthKey, employeeId, advance) => {
    try {
      const docId = `${monthKey}_${employeeId}`;
      const existingData = scheduleData[docId] || {};
      
      await setDoc(doc(db, 'schedules', docId), {
        ...existingData,
        employeeId,
        monthKey,
        advance: parseFloat(advance) || 0,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error updating advance:", error);
    }
  };

  return (
    <ScheduleContext.Provider value={{
      scheduleData,
      employees,
      loading,
      updateCell,
      addEmployee,
      removeEmployee,
      updateEmployee,
      updateAdvance
    }}>
      {children}
    </ScheduleContext.Provider>
  );
};
