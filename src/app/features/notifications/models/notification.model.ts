// statusOverdue — через 30 мин после приёма статус всё ещё «Первичный»: нужно поменять статус
// pendingDecision — перед концом смены у врача остались пациенты «Ожидает решения» (одно уведомление на врача)
export type NotificationType = 'onlineBooking' | 'cancellation' | 'waitingList' | 'noShow' | 'statusOverdue' | 'pendingDecision';

export interface AppNotification {
  id: number;
  type: NotificationType;
  createdAt: Date;
  read: boolean;
  patientName: string;
  doctorName: string;          // 'Сидоров А. П.'
  time: string;                // время приёма, 'HH:mm' (для прошлых дней — 'dd.MM HH:mm')
  appointmentId?: number;      // приём, к которому относится уведомление (для statusOverdue)
  doctorId?: number;           // врач (для pendingDecision)
  count?: number;              // сколько пациентов ждут решения (для pendingDecision)
}
