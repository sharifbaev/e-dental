// awaitingDecision — осмотр проведён, врач решает: в лечение или в архив
// archived — лечение не нужно или пациент отказался
// noShow — пациент не пришёл на приём (только у приёма, не у пациента)
export type PatientStatus = 'primary' | 'awaitingDecision' | 'inTreatment' | 'completed' | 'archived' | 'noShow' | 'cancelled';

// Статусы пациента — раздел «Пациенты»
export const PATIENT_STATUSES: PatientStatus[] = ['primary', 'awaitingDecision', 'inTreatment', 'completed', 'archived', 'cancelled'];

// Статусы приёма — раздел «Расписание» (плюс «Не пришёл»)
export const APPOINTMENT_STATUSES: PatientStatus[] = ['primary', 'awaitingDecision', 'inTreatment', 'completed', 'archived', 'noShow', 'cancelled'];

// Через сколько минут после начала приёма можно отметить «Не пришёл»
export const NO_SHOW_AFTER_MINUTES = 15;

// Через сколько минут после окончания приёма напоминать, что статус всё ещё «Первичный»
export const STATUS_OVERDUE_AFTER_MINUTES = 30;

// За сколько минут до конца смены врача напоминать о пациентах «Ожидает решения»
export const PENDING_DECISION_BEFORE_END_MINUTES = 30;

// Цвета статусов пациента — одинаковые во всём приложении (светлая и тёмная тема)
export const PATIENT_STATUS_CLASSES: Record<PatientStatus, string> = {
  primary: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  awaitingDecision: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  inTreatment: 'bg-brand-50 text-brand-700 dark:text-brand-300',
  completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  archived: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
  noShow: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  cancelled: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
};

// Иконки статусов — для окна смены статуса
export const PATIENT_STATUS_ICONS: Record<PatientStatus, string> = {
  primary: 'person_add',
  awaitingDecision: 'hourglass_top',
  inTreatment: 'medical_services',
  completed: 'task_alt',
  archived: 'inventory_2',
  noShow: 'person_off',
  cancelled: 'event_busy'
};

// В какие статусы обычно переводят из текущего — показываются первыми в окне смены статуса
export const PATIENT_STATUS_NEXT: Record<PatientStatus, PatientStatus[]> = {
  primary: ['awaitingDecision', 'inTreatment', 'archived', 'noShow'],
  awaitingDecision: ['inTreatment', 'archived'],
  inTreatment: ['completed', 'archived', 'noShow'],
  completed: ['inTreatment', 'archived'],
  archived: ['inTreatment'],
  noShow: ['primary', 'inTreatment'],
  cancelled: []
};
