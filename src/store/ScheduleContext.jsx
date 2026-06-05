import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  setDoc, 
  doc, 
  serverTimestamp,
  deleteDoc,
  updateDoc,
  where,
  getDocs,
  getDoc
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useTickets } from './TicketContext';
import { toast } from 'sonner';
import { format, subMonths } from 'date-fns';

const ScheduleContext = createContext();
export const useSchedule = () => useContext(ScheduleContext);

const STORAGE_KEYS = {
  DATA: 'schedule_data_v3',
  EMPLOYEES: 'employees_v3',
  SETTINGS: 'schedule_settings_v3',
  DAILY_RAZVOZKA: 'daily_razvozka_v3'
};

export const ScheduleProvider = ({ children }) => {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const monthKey = format(currentMonth, 'yyyy-MM');
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const clonedMonthsRef = useRef(new Set());
  const clonedSettingsMonthsRef = useRef(new Set());
  const settingsMonthKeyRef = useRef(monthKey);

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

  const [dailyRazvozka, setDailyRazvozka] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DAILY_RAZVOZKA);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // ─── Persist to localStorage whenever state changes ───────────────────────
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.DAILY_RAZVOZKA, JSON.stringify(dailyRazvozka)); } catch {}
  }, [dailyRazvozka]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.DATA, JSON.stringify(scheduleData)); } catch {}
  }, [scheduleData]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees)); } catch {}
  }, [employees]);
  // Load initial settings from localStorage for the active monthKey
  useEffect(() => {
    const defaultSettings = {
      shift1: '8:30-14:30',
      shift2: '14:30-21:30',
      hourlyRate: 1500,
      visibleCols: { totalHours: true, salary: true, razvozka: true, advance: true, correction: true, toPay: true }
    };
    try {
      const saved = localStorage.getItem(`${STORAGE_KEYS.SETTINGS}_${monthKey}`);
      if (saved) {
        setSettings(JSON.parse(saved));
      } else {
        // Fallback to global saved settings if available
        const globalSaved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        if (globalSaved) {
          setSettings(JSON.parse(globalSaved));
        } else {
          setSettings(defaultSettings);
        }
      }
    } catch {
      setSettings(defaultSettings);
    }
    // Mark that the settings state now belongs to this monthKey
    settingsMonthKeyRef.current = monthKey;
  }, [monthKey]);

  // Persist settings to localStorage for the active monthKey
  useEffect(() => {
    // Only save if the settings state actually belongs to the currently active monthKey
    if (settingsMonthKeyRef.current !== monthKey) return;
    try { 
      localStorage.setItem(`${STORAGE_KEYS.SETTINGS}_${monthKey}`, JSON.stringify(settings)); 
    } catch {}
  }, [settings, monthKey]);

  // ─── Track state updates for safe cloud sync ─────────────────────────────
  const stateRef = useRef({ employees, scheduleData, settings, dailyRazvozka });
  useEffect(() => {
    stateRef.current = { employees, scheduleData, settings, dailyRazvozka };
  }, [employees, scheduleData, settings, dailyRazvozka]);

  // ─── Load database listeners when authenticated ─────────────────
  useEffect(() => {
    let unsubSchedules = null;
    let unsubDailyRazvozka = null;

    const unsubscribeAuth = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        // Start listeners
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

        if (!unsubDailyRazvozka) {
          unsubDailyRazvozka = onSnapshot(query(collection(db, 'daily_razvozka')), (snapshot) => {
            const remoteDaily = {};
            snapshot.docs.forEach(d => { remoteDaily[d.id] = d.data(); });
            setDailyRazvozka(remoteDaily);
          }, (error) => {
            console.error('[ScheduleContext] daily_razvozka load error:', error);
          });
        }
      } else {
        // Clean up listeners on sign-out
        if (unsubSchedules) { unsubSchedules(); unsubSchedules = null; }
        if (unsubDailyRazvozka) { unsubDailyRazvozka(); unsubDailyRazvozka = null; }
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubSchedules) unsubSchedules();
      if (unsubDailyRazvozka) unsubDailyRazvozka();
    };
  }, []);

  // ─── Load employee list listener scoped to active monthKey ──────────
  useEffect(() => {
    let unsubEmployees = null;
    setEmployeesLoading(true);

    const unsubscribeAuth = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        if (unsubEmployees) unsubEmployees();
        const q = query(
          collection(db, 'employees'),
          where('monthKey', '==', monthKey)
        );
        unsubEmployees = onSnapshot(q, (snapshot) => {
          const remoteEmployees = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          setEmployees(remoteEmployees.sort((a, b) => (a.order || 0) - (b.order || 0)));
          setEmployeesLoading(false);
        }, (error) => {
          console.error('[ScheduleContext] employees load error:', error);
          setEmployeesLoading(false);
        });
      } else {
        if (unsubEmployees) {
          unsubEmployees();
          unsubEmployees = null;
        }
        setEmployeesLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubEmployees) unsubEmployees();
    };
  }, [monthKey]);

  // ─── Load settings listener scoped to active monthKey ──────────
  useEffect(() => {
    let unsubSettings = null;

    const unsubscribeAuth = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        if (unsubSettings) unsubSettings();
        
        const docRef = doc(db, 'settings', `schedule_${monthKey}`);
        unsubSettings = onSnapshot(docRef, async (snapshot) => {
          if (snapshot.exists()) {
            const remote = snapshot.data();
            const defaultVisibleCols = { totalHours: true, salary: true, razvozka: true, advance: true, correction: true, toPay: true };
            const merged = {
              shift1: remote.shift1 || '8:30-14:30',
              shift2: remote.shift2 || '14:30-21:30',
              hourlyRate: remote.hourlyRate !== undefined ? remote.hourlyRate : 1500,
              visibleCols: {
                ...defaultVisibleCols,
                ...(remote.visibleCols || {})
              }
            };
            setSettings(merged);
            settingsMonthKeyRef.current = monthKey;
          } else {
            // Document does not exist. Let's inherit or initialize it.
            if (clonedSettingsMonthsRef.current.has(monthKey)) return;
            clonedSettingsMonthsRef.current.add(monthKey);
            
            try {
              const prevMonth = subMonths(currentMonth, 1);
              const prevMonthKey = format(prevMonth, 'yyyy-MM');
              
              const prevDocRef = doc(db, 'settings', `schedule_${prevMonthKey}`);
              const prevSnap = await getDoc(prevDocRef);
              
              let initialSettings = null;
              if (prevSnap.exists()) {
                initialSettings = prevSnap.data();
                console.log(`Cloned settings from previous month (${prevMonthKey}) to ${monthKey}`);
              } else {
                // Fallback to the old global settings
                const globalDocRef = doc(db, 'settings', 'schedule');
                const globalSnap = await getDoc(globalDocRef);
                if (globalSnap.exists()) {
                  initialSettings = globalSnap.data();
                  console.log(`Cloned settings from global settings to ${monthKey}`);
                } else {
                  initialSettings = {
                    shift1: '8:30-14:30',
                    shift2: '14:30-21:30',
                    hourlyRate: 1500,
                    visibleCols: { totalHours: true, salary: true, razvozka: true, advance: true, correction: true, toPay: true }
                  };
                  console.log(`Initialized settings with default settings for ${monthKey}`);
                }
              }
              
              await setDoc(doc(db, 'settings', `schedule_${monthKey}`), initialSettings);
            } catch (err) {
              console.error('Error initializing settings:', err);
            }
          }
        });
      } else {
        if (unsubSettings) {
          unsubSettings();
          unsubSettings = null;
        }
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubSettings) unsubSettings();
    };
  }, [monthKey, currentMonth]);

  // ─── Auto-inherit (clone) employees from previous month if empty ───────
  useEffect(() => {
    if (employeesLoading || loading) return;

    const clubs = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA'];
    
    // Find clubs that have no employees in the current month
    const emptyClubs = clubs.filter(club => {
      const hasEmployees = employees.some(e => (e.club || '4YOU') === club);
      const alreadyCloned = clonedMonthsRef.current.has(`${monthKey}_${club}`);
      return !hasEmployees && !alreadyCloned;
    });

    if (emptyClubs.length === 0) return;

    // Mark as cloned immediately to prevent concurrent triggers
    emptyClubs.forEach(club => {
      clonedMonthsRef.current.add(`${monthKey}_${club}`);
    });

    const cloneFromPrevious = async () => {
      try {
        setIsSaving(true);
        const prevMonth = subMonths(currentMonth, 1);
        const prevMonthKey = format(prevMonth, 'yyyy-MM');
        
        // Fetch previous month's employees
        const q = query(collection(db, 'employees'), where('monthKey', '==', prevMonthKey));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          console.log(`No employees to clone from previous month: ${prevMonthKey}`);
          return;
        }
        
        const prevEmployees = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const batch = [];
        
        // Only clone employees for clubs that are empty in the current month
        emptyClubs.forEach(club => {
          const clubPrevEmps = prevEmployees.filter(e => (e.club || '4YOU') === club);
          if (clubPrevEmps.length === 0) {
            console.log(`No employees to clone for club ${club} from previous month ${prevMonthKey}`);
            return;
          }
          
          console.log(`Cloning ${clubPrevEmps.length} employees for club ${club} from ${prevMonthKey} to ${monthKey}`);
          
          clubPrevEmps.forEach(emp => {
            const oldId = emp.id;
            const baseId = oldId.includes('_') ? oldId.split('_').slice(1).join('_') : oldId;
            const newId = `${monthKey}_${baseId}`;
            
            batch.push(
              setDoc(doc(db, 'employees', newId), {
                ...emp,
                id: newId,
                monthKey: monthKey,
                createdAt: new Date()
              })
            );
          });
        });
        
        if (batch.length > 0) {
          await Promise.all(batch);
          toast.success(`Перенесены сотрудники для пустых клубов с прошлого месяца (${prevMonthKey})`);
        }
      } catch (err) {
        console.error('Error cloning employees:', err);
        toast.error('Не удалось скопировать список сотрудников с прошлого месяца');
      } finally {
        setIsSaving(false);
      }
    };

    cloneFromPrevious();
  }, [employees, employeesLoading, loading, monthKey, currentMonth]);

  const getScheduleDocId = (mKey, empId) => empId.includes('_') ? empId : `${mKey}_${empId}`;

  // ─── updateCell ───────────────────────────────────────────────────────────
  const updateCell = async (monthKey, employeeId, day, value) => {
    const docId = getScheduleDocId(monthKey, employeeId);

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
    const docId = getScheduleDocId(monthKey, employeeId);
    setScheduleData(prev => ({
      ...prev,
      [docId]: { ...prev[docId], employeeId, monthKey, advance: val }
    }));
    try {
      setIsSaving(true);
      await setDoc(doc(db, 'schedules', docId), {
        employeeId, monthKey, advance: val
      }, { merge: true });
    } finally { setIsSaving(false); }
  };

  // ─── updateCorrection ─────────────────────────────────────────────────────
  const updateCorrection = async (monthKey, employeeId, val) => {
    const docId = getScheduleDocId(monthKey, employeeId);
    setScheduleData(prev => ({
      ...prev,
      [docId]: { ...prev[docId], employeeId, monthKey, correction: val }
    }));
    try {
      setIsSaving(true);
      await setDoc(doc(db, 'schedules', docId), {
        employeeId, monthKey, correction: val
      }, { merge: true });
    } finally { setIsSaving(false); }
  };

  // ─── updateSalaryOverride ─────────────────────────────────────────────────
  const updateSalaryOverride = async (monthKey, employeeId, val) => {
    const docId = getScheduleDocId(monthKey, employeeId);
    setScheduleData(prev => ({
      ...prev,
      [docId]: { ...prev[docId], employeeId, monthKey, salaryOverride: val }
    }));
    try {
      setIsSaving(true);
      await setDoc(doc(db, 'schedules', docId), {
        employeeId, monthKey, salaryOverride: val
      }, { merge: true });
    } finally { setIsSaving(false); }
  };

  // ─── updateRazvozkaOverride ───────────────────────────────────────────────
  const updateRazvozkaOverride = async (monthKey, employeeId, val) => {
    const docId = getScheduleDocId(monthKey, employeeId);
    setScheduleData(prev => ({
      ...prev,
      [docId]: { ...prev[docId], employeeId, monthKey, razvozkaOverride: val }
    }));
    try {
      setIsSaving(true);
      await setDoc(doc(db, 'schedules', docId), {
        employeeId, monthKey, razvozkaOverride: val
      }, { merge: true });
    } finally { setIsSaving(false); }
  };

  // ─── updateDailyRazvozka ──────────────────────────────────────────────────
  const updateDailyRazvozka = async (monthKey, club, day, value) => {
    const docId = `${monthKey}_${club}`;
    const cleanVal = value === '' ? null : value;

    let updatedDays = {};
    setDailyRazvozka(prev => {
      const currentDoc = prev[docId] || { monthKey, club, days: {} };
      const newDays = { ...currentDoc.days };
      if (cleanVal === null) {
        delete newDays[day];
      } else {
        newDays[day] = cleanVal;
      }
      updatedDays = newDays;
      return {
        ...prev,
        [docId]: {
          ...currentDoc,
          days: newDays
        }
      };
    });

    try {
      setIsSaving(true);
      const docRef = doc(db, 'daily_razvozka', docId);
      await setDoc(docRef, {
        monthKey,
        club,
        days: updatedDays,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error('Error updating daily razvozka:', e);
      toast.error('Ошибка сохранения развозки');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── addEmployee ──────────────────────────────────────────────────────────
  const addEmployee = async (name, club = '4YOU') => {
    try {
      setIsSaving(true);
      const baseId = Date.now().toString();
      const id = `${monthKey}_${baseId}`;
      const newEmp = { id, name: name.trim(), club, order: employees.length, monthKey, createdAt: new Date() };
      
      setEmployees(prev => [...prev, newEmp]);
      await setDoc(doc(db, 'employees', id), newEmp);
      
      toast.success('Сотрудник добавлен');
    } catch (error) {
      console.error('Error adding employee:', error);
    } finally { setIsSaving(false); }
  };

  // ─── removeEmployee ───────────────────────────────────────────────────────
  const removeEmployee = async (id) => {
    try {
      setIsSaving(true);
      // Remove locally first
      setEmployees(prev => prev.filter(e => e.id !== id));
      await deleteDoc(doc(db, 'employees', id));
      toast.success('Удалено');
    } catch (err) {
      console.error('Error removing employee:', err);
      toast.error('Не удалось удалить сотрудника');
    } finally { setIsSaving(false); }
  };

  // ─── updateEmployee ───────────────────────────────────────────────────────
  const updateEmployee = async (id, name) => {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, name } : e));
    try { await updateDoc(doc(db, 'employees', id), { name }); } catch {}
  };

  // ─── setEmployeeService ───────────────────────────────────────────────────
  // Marks/unmarks an employee as a service worker (сервисник).
  // Service workers appear in the schedule but are excluded from hours/salary totals.
  const setEmployeeService = async (id, isService) => {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, isService } : e));
    try { await updateDoc(doc(db, 'employees', id), { isService }); } catch {}
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
    settingsMonthKeyRef.current = monthKey;
    setSettings(s);
    try { await setDoc(doc(db, 'settings', `schedule_${monthKey}`), s, { merge: true }); } catch {}
  };

  return (
    <ScheduleContext.Provider value={{
      scheduleData, employees, loading, isSaving,
      currentMonth, setCurrentMonth, monthKey, employeesLoading,
      updateCell, addEmployee, removeEmployee, updateEmployee, setEmployeeService,
      updateAdvance, updateCorrection, updateSalaryOverride, updateRazvozkaOverride, moveEmployee, reorderEmployees,
      settings, updateSettings,
      dailyRazvozka, updateDailyRazvozka
    }}>
      {children}
    </ScheduleContext.Provider>
  );
};
