import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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
import { db, auth } from '../lib/firebase';
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
    const defaultSettings = {
      shift1: '8:30-14:30',
      shift2: '14:30-21:30',
      hourlyRate: 1500,
      visibleCols: { totalHours: true, salary: true, razvozka: true, advance: true, correction: true, toPay: true }
    };
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...defaultSettings,
          ...parsed,
          visibleCols: {
            ...defaultSettings.visibleCols,
            ...(parsed.visibleCols || {})
          }
        };
      }
      return defaultSettings;
    } catch {
      return defaultSettings;
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

  // ─── Track state updates for safe cloud sync ─────────────────────────────
  const stateRef = useRef({ employees, scheduleData, settings });
  useEffect(() => {
    stateRef.current = { employees, scheduleData, settings };
  }, [employees, scheduleData, settings]);

  // ─── Sync local offline data to cloud & load database listeners when authenticated ─────────────────
  const hasSyncedRef = useRef(false);
  useEffect(() => {
    let unsubSchedules = null;
    let unsubSettings = null;
    let unsubEmployees = null;

    const unsubscribeAuth = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        // 1. Sync offline changes first
        if (!hasSyncedRef.current) {
          hasSyncedRef.current = true;
          try {
            const { scheduleData: currentSched, settings: currentSettings } = stateRef.current;
            console.log("[ScheduleContext] Authenticated, starting sync of local data to cloud...");
            
            // Sync Schedules
            const scheduleEntries = Object.entries(currentSched);
            if (scheduleEntries.length > 0) {
              for (const [docId, data] of scheduleEntries) {
                if (!data || !data.days) continue;
                await setDoc(doc(db, 'schedules', docId), {
                  ...data,
                  updatedAt: serverTimestamp()
                }, { merge: true });
              }
            }
            // Sync Settings
            if (currentSettings) {
              await setDoc(doc(db, 'settings', 'schedule'), currentSettings, { merge: true });
            }
            console.log("[ScheduleContext] Sync completed successfully");
          } catch (err) {
            console.error("[ScheduleContext] Sync failed:", err);
            hasSyncedRef.current = false;
          }
        }

        // 2. Start listeners
        if (!unsubSchedules) {
          unsubSchedules = onSnapshot(query(collection(db, 'schedules')), (snapshot) => {
            const remoteData = {};
            snapshot.docs.forEach(d => { remoteData[d.id] = d.data(); });
            setScheduleData(remoteData);
            setLoading(false);
          }, (error) => {
            console.error('[ScheduleContext] schedules load error:', error);
            setLoading(false);
            toast.error('Ошибка связи с базой данных. Работаем в оффлайн-режиме.');
          });
        }

        if (!unsubSettings) {
          unsubSettings = onSnapshot(doc(db, 'settings', 'schedule'), (snapshot) => {
            if (snapshot.exists()) {
              const remote = snapshot.data();
              setSettings(prev => {
                const defaultVisibleCols = { totalHours: true, salary: true, razvozka: true, advance: true, correction: true, toPay: true };
                return {
                  ...defaultVisibleCols,
                  ...remote,
                  visibleCols: {
                    ...defaultVisibleCols,
                    ...(remote.visibleCols || {}),
                    ...(prev?.visibleCols || {})
                  }
                };
              });
            }
          });
        }

        if (!unsubEmployees) {
          unsubEmployees = onSnapshot(query(collection(db, 'employees')), (snapshot) => {
            const remoteEmployees = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setEmployees(remoteEmployees.sort((a, b) => (a.order || 0) - (b.order || 0)));
          }, (error) => {
            console.error('[ScheduleContext] employees load error:', error);
          });
        }
      } else {
        // Clean up listeners on sign-out
        if (unsubSchedules) { unsubSchedules(); unsubSchedules = null; }
        if (unsubSettings) { unsubSettings(); unsubSettings = null; }
        if (unsubEmployees) { unsubEmployees(); unsubEmployees = null; }
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubSchedules) unsubSchedules();
      if (unsubSettings) unsubSettings();
      if (unsubEmployees) unsubEmployees();
    };
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

  // ─── updateSalaryOverride ─────────────────────────────────────────────────
  const updateSalaryOverride = async (monthKey, employeeId, val) => {
    const docId = `${monthKey}_${employeeId}`;
    setScheduleData(prev => ({
      ...prev,
      [docId]: { ...prev[docId], employeeId, monthKey, salaryOverride: parseFloat(val) || 0 }
    }));
    try {
      setIsSaving(true);
      await setDoc(doc(db, 'schedules', docId), {
        employeeId, monthKey, salaryOverride: parseFloat(val) || 0
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

  // ─── reorderEmployees ───────────────────────────────────────────────────────
  const reorderEmployees = async (draggedId, targetId) => {
    try {
      const draggedEmp = employees.find(e => e.id === draggedId);
      if (!draggedEmp) return;
      const clubName = draggedEmp.club || '4YOU';
      const clubEmps = employees.filter(e => (e.club || '4YOU') === clubName);
      
      const draggedIdx = clubEmps.findIndex(e => e.id === draggedId);
      const targetIdx = clubEmps.findIndex(e => e.id === targetId);
      
      if (draggedIdx === -1 || targetIdx === -1 || draggedIdx === targetIdx) return;
      
      const reorderedClubEmps = [...clubEmps];
      const [draggedItem] = reorderedClubEmps.splice(draggedIdx, 1);
      reorderedClubEmps.splice(targetIdx, 0, draggedItem);
      
      const otherClubsEmps = employees.filter(e => (e.club || '4YOU') !== clubName);
      const newEmployees = [...otherClubsEmps, ...reorderedClubEmps];
      
      setEmployees(newEmployees);
      await Promise.all(newEmployees.map((emp, i) => updateDoc(doc(db, 'employees', emp.id), { order: i })));
    } catch (e) {
      console.error('Error reordering:', e);
    }
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
      updateAdvance, updateCorrection, updateSalaryOverride, moveEmployee, reorderEmployees,
      settings, updateSettings
    }}>
      {children}
    </ScheduleContext.Provider>
  );
};
