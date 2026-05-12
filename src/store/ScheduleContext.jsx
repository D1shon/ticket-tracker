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

const STORAGE_KEYS = {
  DATA: 'schedule_data_v3',
  EMPLOYEES: 'employees_v3',
  SETTINGS: 'schedule_settings_v3'
};

export const ScheduleProvider = ({ children }) => {
  const [scheduleData, setScheduleData] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DATA);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [employees, setEmployees] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
      const list = saved ? JSON.parse(saved) : [];
      if (list.length === 0) {
        return [
          { id: 'c1', name: 'Сотрудник 1 (Колибри)', club: 'COLIBRI', order: 0 },
          { id: 'c2', name: 'Сотрудник 2 (Колибри)', club: 'COLIBRI', order: 1 },
          { id: 'c3', name: 'Сотрудник 3 (Колибри)', club: 'COLIBRI', order: 2 }
        ];
      }
      return list;
    } catch { return []; }
  });
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return saved ? JSON.parse(saved) : {
        shift1: '8:30-14:30',
        shift2: '14:30-21:30',
        hourlyRate: 1500,
        visibleCols: { totalHours: true, salary: true, advance: true, correction: true, toPay: true }
      };
    } catch {
      return {
        shift1: '8:30-14:30',
        shift2: '14:30-21:30',
        hourlyRate: 1500,
        visibleCols: { totalHours: true, salary: true, advance: true, correction: true, toPay: true }
      };
    }
  });

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // ─── Persist to localStorage whenever state changes ───────────────────────
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.DATA, JSON.stringify(scheduleData)); } catch {}
  }, [scheduleData]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees)); } catch {}
  }, [employees]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings)); } catch {}
  }, [settings]);

  // ─── scheduleData listener: LOCAL ALWAYS WINS ─────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'schedules'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const remoteData = {};
      snapshot.docs.forEach(d => { remoteData[d.id] = d.data(); });

      setScheduleData(prev => {
        const merged = { ...prev };

        for (const [id, remoteDoc] of Object.entries(remoteData)) {
          if (!merged[id]) {
            // Not in local at all — safe to add from remote
            merged[id] = remoteDoc;
          } else {
            // Exists locally — local always wins for day cells
            const localDays = merged[id].days || {};
            const remoteDays = remoteDoc.days || {};

            // Remote days as base, local days override
            const mergedDays = { ...remoteDays, ...localDays };

            merged[id] = {
              ...remoteDoc,   // remote top-level fields (advance, correction…)
              ...merged[id],  // local top-level fields override remote
              days: mergedDays
            };
          }
        }
        return merged;
      });

      setLoading(false);
    }, (error) => {
      console.error('Ошибка загрузки данных:', error);
      setLoading(false); // Never get stuck on loading even on error
      toast.error('Ошибка связи с базой данных. Работаем в оффлайн-режиме.');
    });
    return () => unsubscribe();
  }, []);

  // ─── settings listener: LOCAL ALWAYS WINS ─────────────────────────────────
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'schedule'), (snapshot) => {
      if (snapshot.exists()) {
        setSettings(prev => {
          // Local settings take absolute priority over remote
          return { ...snapshot.data(), ...prev };
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // ─── employees listener: LOCAL ALWAYS WINS ────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'employees'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const remoteEmployees = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      setEmployees(prev => {
        if (prev.length === 0 && remoteEmployees.length > 0) {
          // Local list is empty — safe to load from remote
          return [...remoteEmployees].sort((a, b) => (a.order || 0) - (b.order || 0));
        }

        if (prev.length > 0) {
          // Local list exists — it is the absolute source of truth
          // Only add remote employees that do NOT exist locally (new on another device)
          const localIds = new Set(prev.map(e => e.id));
          const newFromRemote = remoteEmployees.filter(e => !localIds.has(e.id));

          if (newFromRemote.length === 0) {
            // Nothing new from remote — keep local list UNCHANGED
            return prev;
          }

          // Append new remote employees and re-sort by order field
          const combined = [...prev, ...newFromRemote];
          combined.sort((a, b) => (a.order || 0) - (b.order || 0));
          return combined;
        }

        return prev;
      });
    }, (error) => {
      console.error('Ошибка загрузки сотрудников:', error);
    });
    return () => unsubscribe();
  }, []);

  // ─── updateCell ───────────────────────────────────────────────────────────
  const updateCell = async (monthKey, employeeId, day, value) => {
    const docId = `${monthKey}_${employeeId}`;

    // 1. Instant local save FIRST — Local Storage is source of truth
    setScheduleData(prev => ({
      ...prev,
      [docId]: {
        ...prev[docId],
        employeeId,
        monthKey,
        days: { ...(prev[docId]?.days || {}), [day]: value }
      }
    }));

    // 2. Then sync to cloud
    try {
      setIsSaving(true);
      const docRef = doc(db, 'schedules', docId);
      await updateDoc(docRef, {
        [`days.${day}`]: value,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      if (e.code === 'not-found') {
        try {
          await setDoc(doc(db, 'schedules', docId), {
            employeeId,
            monthKey,
            days: { [day]: value },
            updatedAt: serverTimestamp()
          });
        } catch (err) {
          console.error('Критическая ошибка создания:', err);
          toast.error('ОШИБКА: Нет доступа к базе. Данные сохранены только на этом устройстве.');
        }
      } else {
        console.error('Ошибка обновления:', e);
        toast.error('ОШИБКА СИНХРОНИЗАЦИИ: ' + e.message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // ─── updateAdvance ────────────────────────────────────────────────────────
  const updateAdvance = async (monthKey, employeeId, val) => {
    const docId = `${monthKey}_${employeeId}`;
    setScheduleData(prev => ({
      ...prev,
      [docId]: { ...prev[docId], employeeId, monthKey, advance: parseFloat(val) || 0 }
    }));
    try {
      setIsSaving(true);
      await setDoc(doc(db, 'schedules', docId), {
        employeeId, monthKey, advance: parseFloat(val) || 0
      }, { merge: true });
    } finally { setIsSaving(false); }
  };

  // ─── updateCorrection ─────────────────────────────────────────────────────
  const updateCorrection = async (monthKey, employeeId, val) => {
    const docId = `${monthKey}_${employeeId}`;
    setScheduleData(prev => ({
      ...prev,
      [docId]: { ...prev[docId], employeeId, monthKey, correction: parseFloat(val) || 0 }
    }));
    try {
      setIsSaving(true);
      await setDoc(doc(db, 'schedules', docId), {
        employeeId, monthKey, correction: parseFloat(val) || 0
      }, { merge: true });
    } finally { setIsSaving(false); }
  };

  // ─── addEmployee ──────────────────────────────────────────────────────────
  const addEmployee = async (name, club = '4YOU') => {
    try {
      setIsSaving(true);
      const id = Date.now().toString();
      const newEmp = { id, name: name.trim(), club, order: employees.length, createdAt: new Date() };
      
      setEmployees(prev => [...prev, newEmp]);
      await setDoc(doc(db, 'employees', id), newEmp);
      
      toast.success('Сотрудник добавлен');
    } catch (error) {
      console.error('Error adding employee:', error);
    } finally { setIsSaving(false); }
  };

  // ─── removeEmployee ───────────────────────────────────────────────────────
  const removeEmployee = async (id) => {
    if (!window.confirm('Удалить сотрудника?')) return;
    try {
      setIsSaving(true);
      // Remove locally first
      setEmployees(prev => prev.filter(e => e.id !== id));
      await deleteDoc(doc(db, 'employees', id));
      toast.success('Удалено');
    } finally { setIsSaving(false); }
  };

  // ─── updateEmployee ───────────────────────────────────────────────────────
  const updateEmployee = async (id, name) => {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, name } : e));
    try { await updateDoc(doc(db, 'employees', id), { name }); } catch {}
  };

  // ─── moveEmployee ─────────────────────────────────────────────────────────
  const moveEmployee = async (id, direction) => {
    try {
      const idx = employees.findIndex(e => e.id === id);
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= employees.length) return;
      const newEmployees = [...employees];
      [newEmployees[idx], newEmployees[targetIdx]] = [newEmployees[targetIdx], newEmployees[idx]];
      setEmployees(newEmployees);
      await Promise.all(newEmployees.map((emp, i) => updateDoc(doc(db, 'employees', emp.id), { order: i })));
    } catch {}
  };

  // ─── updateSettings ───────────────────────────────────────────────────────
  const updateSettings = async (s) => {
    setSettings(s);
    try { await setDoc(doc(db, 'settings', 'schedule'), s, { merge: true }); } catch {}
  };

  return (
    <ScheduleContext.Provider value={{
      scheduleData, employees, loading, isSaving,
      updateCell, addEmployee, removeEmployee, updateEmployee,
      updateAdvance, updateCorrection, moveEmployee,
      settings, updateSettings
    }}>
      {children}
    </ScheduleContext.Provider>
  );
};
