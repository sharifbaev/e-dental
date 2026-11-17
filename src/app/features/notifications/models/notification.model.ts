// statusOverdue — приём прошёл, а статус всё ещё «Первичный»: нужно поменять статус
export type NotificationType = 'onlineBooking' | 'cancellation' | 'waitingList' | 'noShow' | 'statusOverdue';

export interface AppNotification {
  id: number;
  type: NotificationType;
  createdAt: Date;
  read: boolean;
  patientName: string;
  doctorName: string;          // 'Сидоров А. П.'
  time: string;                // время приёма, 'HH:mm' (для прошлых дней — 'dd.MM HH:mm')
  appointmentId?: number;      // приём, к которому относится уведомление (для statusOverdue)
}
