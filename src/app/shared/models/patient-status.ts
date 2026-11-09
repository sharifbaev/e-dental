export type PatientStatus = 'primary' | 'inTreatment' | 'completed' | 'cancelled';

export const PATIENT_STATUSES: PatientStatus[] = ['primary', 'inTreatment', 'completed', 'cancelled'];

// Цвета статусов пациента — одинаковые во всём приложении (светлая и тёмная тема)
export const PATIENT_STATUS_CLASSES: Record<PatientStatus, string> = {
  primary: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  inTreatment: 'bg-brand-50 text-brand-700 dark:text-brand-300',
  completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  cancelled: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
};
