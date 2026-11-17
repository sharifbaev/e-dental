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

// Ориентировочные цены услуг, сум — подставляются в окно оплаты и план лечения
// TODO: брать из справочника услуг на API
export const SERVICE_PRICES: Record<number, number> = {
  1: 350_000,                  // Лечение кариеса
  2: 400_000,                  // Профессиональная гигиена AirFlow
  3: 100_000,                  // Консультация и осмотр
  4: 250_000,                  // Удаление зуба
  5: 150_000                   // Острая боль
};
