import { Doctor } from '../../../shared/models/doctor.model';

// Модель врача и статусы — в одном месте (shared), здесь реэкспорт для текущих импортов
export { DOCTOR_STATUSES, DOCTOR_STATUS_CLASSES } from '../../../shared/models/doctor.model';
export type { Doctor, DoctorStatus } from '../../../shared/models/doctor.model';

import type { DoctorAccount } from '../services/doctors.service';

// Данные из формы врача (id и пациентов сегодня задаёт система)
export type DoctorDraft = Omit<Doctor, 'id' | 'patientsToday'>;

// Результат формы врача: данные + логин (только при создании, необязательно)
export type DoctorFormResult = DoctorDraft & { account?: DoctorAccount };
