// Рейтинг пациента: надёжный / требует внимания / проблемный
export type PatientRating = 'good' | 'warn' | 'risk';

export const PATIENT_RATINGS: PatientRating[] = ['good', 'warn', 'risk'];

// Цветной квадратик рейтинга (цвета — в tailwind.css: --color-rating-*)
export const PATIENT_RATING_DOT: Record<PatientRating, string> = {
  good: 'bg-rating-good',
  warn: 'bg-rating-warn',
  risk: 'bg-rating-risk'
};

// Плашка с названием рейтинга (светлая и тёмная тема)
export const PATIENT_RATING_CLASSES: Record<PatientRating, string> = {
  good: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  warn: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  risk: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300'
};
