export interface TreatmentPlan {
  id: number;
  patientId: number;
  patientName: string;
  doctorId: number;
  doctorName: string;
  procedures: string[];        // названия процедур
  visits: number;              // сколько визитов понадобится
  cost: number;                // примерная стоимость, сум
  notes: string;
  createdAt: string;           // 'YYYY-MM-DD'
  nextAppointmentId?: number;  // следующий приём, созданный вместе с планом
  appointmentIds?: number[];   // все визиты серии, созданные вместе с планом
}

export type TreatmentPlanDraft = Omit<TreatmentPlan, 'id' | 'createdAt' | 'nextAppointmentId' | 'appointmentIds'>;

// Следующий приём из формы плана
export interface NextVisitDraft {
  date: string;                // 'YYYY-MM-DD'
  time: string;                // 'HH:mm'
  durationMinutes: number;
  serviceId: number;
  serviceName: string;
}

// Результат окна плана: 'skip' — сменить статус без плана
// series — все визиты серии (next — первый из них, для совместимости)
export type TreatmentPlanDialogResult = 'skip' | { plan: TreatmentPlanDraft; next: NextVisitDraft | null; series?: NextVisitDraft[] };
