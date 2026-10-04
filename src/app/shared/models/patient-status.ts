export type PatientStatus = 'primary' | 'inTreatment' | 'completed' | 'cancelled';

export const PATIENT_STATUSES: PatientStatus[] = ['primary', 'inTreatment', 'completed', 'cancelled'];

// Цвета статусов пациента — одинаковые во всём приложении
export const PATIENT_STATUS_CLASSES: Record<PatientStatus, string> = {
  primary: 'bg-sky-50 text-sky-700',
  inTreatment: 'bg-brand-50 text-brand-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-600'
};
