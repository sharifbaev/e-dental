import { Doctor } from '../../../shared/models/doctor.model';

// Модель врача и статусы — в одном месте (shared), здесь реэкспорт для текущих импортов
export { DOCTOR_STATUSES, DOCTOR_STATUS_CLASSES } from '../../../shared/models/doctor.model';
export type { Doctor, DoctorStatus } from '../../../shared/models/doctor.model';

// TODO: получать справочник специальностей с API
export const SPECIALTIES = [
  'Терапевт', 'Гигиенист', 'Хирург', 'Ортодонт', 'Ортопед',
  'Детский стоматолог', 'Имплантолог', 'Пародонтолог', 'Эндодонтист', 'Рентгенолог'
];

// Данные из формы врача (id и пациентов сегодня задаёт система)
export type DoctorDraft = Omit<Doctor, 'id' | 'patientsToday'>;
