export type PaymentMethod = 'cash' | 'card' | 'click' | 'payme';

export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'click', 'payme'];

// visit — оплата приёма; repayment — погашение долга (без новой услуги)
export type PaymentKind = 'visit' | 'repayment';

export interface Payment {
  id: number;
  kind: PaymentKind;
  patientId: number;
  patientName: string;
  appointmentId?: number;      // для оплаты приёма
  date: string;                // 'YYYY-MM-DD'
  service: string;             // услуга приёма; для погашения — пусто
  amount: number;              // начислено (стоимость), сум; для погашения — 0
  paid: number;                // оплачено, сум
  method: PaymentMethod;
}

export type PaymentDraft = Omit<Payment, 'id'>;
