export type NotificationType = 'onlineBooking' | 'cancellation' | 'waitingList' | 'noShow';

export interface AppNotification {
  id: number;
  type: NotificationType;
  createdAt: Date;
  read: boolean;
  patientName: string;
  doctorName: string;          // 'Сидоров А. П.'
  time: string;                // время приёма, 'HH:mm'
}
