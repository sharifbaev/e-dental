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
}

export type TreatmentPlanDraft = Omit<TreatmentPlan, 'id' | 'createdAt' | 'nextAppointmentId'>;

// Следующий приём из формы плана
export interface NextVisitDraft {
  date: string;                // 'YYYY-MM-DD'
  time: string;                // 'HH:mm'
  durationMinutes: number;
  serviceId: number;
  serviceName: string;
}

// Результат окна плана: 'skip' — сменить статус без плана
export type TreatmentPlanDialogResult = 'skip' | { plan: TreatmentPlanDraft; next: NextVisitDraft | null };
