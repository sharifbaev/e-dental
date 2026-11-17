import { Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogConfig, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { toSignal } from '@angular/core/rxjs-interop';
import { APPOINTMENT_STATUSES, PATIENT_STATUS_CLASSES, PATIENT_STATUSES, PatientStatus } from '../../../../shared/models/patient-status';
import { PATIENT_RATING_CLASSES, PATIENT_RATING_DOT, mockPatientRating } from '../../../../shared/models/patient-rating';
import { FeedbackService } from '../../../../shared/services/feedback.service';
import { uzPhoneValidator } from '../../../../shared/validators/uz-phone.validator';
import { Gender } from '../../models/patient.model';
import { PatientsService } from '../../services/patients.service';
import { DentalChart } from '../dental-chart/dental-chart';
import { ScheduleService, toDateKey } from '../../../schedule/services/schedule.service';
import { PaymentsService, formatMoney } from '../../../payments/services/payments.service';
import { PaymentDraft } from '../../../payments/models/payment.model';
import { PAYMENT_DIALOG_CONFIG, PaymentDialog, PaymentDialogData } from '../../../payments/components/payment-dialog/payment-dialog';
import { TreatmentPlansService } from '../../../treatment-plans/services/treatment-plans.service';
import { filter, switchMap } from 'rxjs';

// Разделы карточки пациента
type Section = 'overview' | 'chart' | 'treatment' | 'visits';

export interface PatientDetailsDialogData {
  patientId: number;
}

// На ПК окно, на мобилке — на весь экран (см. styles.scss)
export const PATIENT_DETAILS_DIALOG_CONFIG: MatDialogConfig = {
  width: '720px',
  maxWidth: '100vw',
  height: '90vh',
  maxHeight: '100dvh',
  autoFocus: false,
  panelClass: 'patient-details-dialog'
};

const LOCALES: Record<string, string> = { ru: 'ru-RU', uz: 'uz-Latn-UZ' };

// 'YYYY-MM-DD' → Date по местному времени
function fromDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Полных лет на сегодня
function getAge(birthDate: string): number {
  const birth = fromDateKey(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hadBirthday = today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hadBirthday) age--;
  return age;
}

// «Ковалёв Максим Дмитриевич» → «КМ»
function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('');
}

@Component({
  selector: 'app-patient-details-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe, DentalChart],
  templateUrl: './patient-details-dialog.html',
  // Компонент на всю высоту окна: шапка сверху, данные прокручиваются, кнопки внизу
  host: { class: 'flex flex-col h-full' }
})
export class PatientDetailsDialog {
  private readonly data = inject<PatientDetailsDialogData>(MAT_DIALOG_DATA);
  private readonly patientsService = inject(PatientsService);
  private readonly feedback = inject(FeedbackService);
  private readonly transloco = inject(TranslocoService);
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);
  private readonly scheduleService = inject(ScheduleService);
  private readonly paymentsService = inject(PaymentsService);
  private readonly plansService = inject(TreatmentPlansService);

  private readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang()
  });

  private readonly locale = computed(() => LOCALES[this.lang()] ?? 'ru-RU');

  protected readonly statuses = PATIENT_STATUSES;
  protected readonly doctors = this.patientsService.doctors;

  // Пациент берётся из сервиса — после сохранения данные в модалке обновятся сами
  protected readonly patient = computed(() =>
    this.patientsService.patients().find(p => p.id === this.data.patientId)
  );

  // Данные для режима чтения: даты, возраст, статус, инициалы — всё считаем заранее
  protected readonly view = computed(() => {
    const patient = this.patient();
    if (!patient) return null;

    const dateFormat = new Intl.DateTimeFormat(this.locale(), { day: '2-digit', month: '2-digit', year: 'numeric' });

    return {
      ...patient,
      initials: getInitials(patient.fullName),
      age: getAge(patient.birthDate),
      birthDateLabel: dateFormat.format(fromDateKey(patient.birthDate)),
      statusKey: `schedule.status.${patient.status}`,
      statusClass: PATIENT_STATUS_CLASSES[patient.status],
      ratingKey: `rating.${patient.rating ?? mockPatientRating(patient.id)}`,
      ratingClass: PATIENT_RATING_CLASSES[patient.rating ?? mockPatientRating(patient.id)],
      ratingDot: PATIENT_RATING_DOT[patient.rating ?? mockPatientRating(patient.id)],
      lastVisitLabel: patient.lastVisit ? dateFormat.format(fromDateKey(patient.lastVisit)) : '',
      nextVisitLabel: patient.nextVisit ? `${dateFormat.format(fromDateKey(patient.nextVisit))}, ${patient.nextVisitTime}` : '',
      diagnoses: patient.diagnoses.map(d => ({ ...d, dateLabel: dateFormat.format(fromDateKey(d.date)) }))
    };
  });

  // ---- Разделы карточки ----

  protected readonly sections: { id: Section; key: string; icon: string }[] = [
    { id: 'overview', key: 'patients.sections.overview', icon: 'person' },
    { id: 'chart', key: 'patients.sections.chart', icon: 'dentistry' },
    { id: 'treatment', key: 'patients.sections.treatment', icon: 'medical_services' },
    { id: 'visits', key: 'patients.sections.visits', icon: 'history' }
  ];

  protected readonly section = signal<Section>('overview');

  protected selectSection(section: Section): void {
    this.section.set(section);
  }

  private readonly dayFormat = computed(() => new Intl.DateTimeFormat(this.locale(), { day: '2-digit', month: '2-digit', year: 'numeric' }));

  // ---- План лечения ----

  protected readonly plans = computed(() => {
    const patient = this.patient();
    if (!patient) return [];
    const appointments = this.scheduleService.appointments();

    return this.plansService.forPatient(patient.id).map(plan => {
      const next = appointments.find(a => a.id === plan.nextAppointmentId);
      return {
        ...plan,
        createdLabel: this.dayFormat().format(fromDateKey(plan.createdAt)),
        costLabel: formatMoney(plan.cost, this.locale()),
        nextLabel: next ? `${this.dayFormat().format(fromDateKey(next.date))}, ${next.start}` : ''
      };
    });
  });

  // ---- Оплаты и долг ----

  protected readonly debt = computed(() => {
    const patient = this.patient();
    return patient ? this.paymentsService.debtOf(patient.id) : 0;
  });

  protected readonly debtLabel = computed(() => formatMoney(this.debt(), this.locale()));

  protected readonly payments = computed(() => {
    const patient = this.patient();
    if (!patient) return [];

    return this.paymentsService.forPatient(patient.id).map(p => ({
      ...p,
      dateLabel: this.dayFormat().format(fromDateKey(p.date)),
      methodKey: `payments.methods.${p.method}`,
      amountLabel: formatMoney(p.amount, this.locale()),
      paidLabel: formatMoney(p.paid, this.locale()),
      owes: p.amount > p.paid
    }));
  });

  // Погашение долга
  protected repay(): void {
    const patient = this.patient();
    if (!patient || this.debt() <= 0) return;

    this.dialog
      .open<PaymentDialog, PaymentDialogData, PaymentDraft>(PaymentDialog, {
        ...PAYMENT_DIALOG_CONFIG,
        data: {
          kind: 'repayment',
          patientId: patient.id,
          patientName: patient.fullName,
          date: toDateKey(new Date()),
          service: '',
          suggestedAmount: this.debt()
        }
      })
      .afterClosed()
      .pipe(
        filter((draft): draft is PaymentDraft => !!draft),
        switchMap(draft => this.paymentsService.add(draft))
      )
      .subscribe({
        next: () => this.feedback.success('feedback.paymentSaved'),
        error: () => this.feedback.error()
      });
  }

  // ---- История визитов (из расписания) ----

  // Фильтры визитов: статус, врач, оплата, период
  protected readonly visitStatus = signal<PatientStatus | ''>('');
  protected readonly visitDoctor = signal<string>('');
  protected readonly visitPayment = signal<'' | 'paid' | 'debt' | 'unpaid'>('');
  protected readonly visitFrom = signal('');
  protected readonly visitTo = signal('');

  protected readonly visitStatuses = APPOINTMENT_STATUSES;

  protected readonly hasVisitFilters = computed(() =>
    !!(this.visitStatus() || this.visitDoctor() || this.visitPayment() || this.visitFrom() || this.visitTo())
  );

  protected resetVisitFilters(): void {
    this.visitStatus.set('');
    this.visitDoctor.set('');
    this.visitPayment.set('');
    this.visitFrom.set('');
    this.visitTo.set('');
  }

  // Все визиты пациента — от них считаются списки для фильтров
  private readonly allVisits = computed(() => {
    const patient = this.patient();
    if (!patient) return [];
    return this.scheduleService.appointments().filter(a => a.patientId === patient.id);
  });

  // Врачи, у которых был пациент
  protected readonly visitDoctors = computed(() => {
    const map = new Map<number, string>();
    for (const a of this.allVisits()) map.set(a.doctorId, a.doctorName);
    return [...map.entries()].map(([id, name]) => ({ id: String(id), name })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  });

  protected readonly visitsTotal = computed(() => this.allVisits().length);

  protected readonly visits = computed(() => {
    const patient = this.patient();
    if (!patient) return [];
    const paid = this.paymentsService.byAppointment();
    const status = this.visitStatus();
    const doctor = this.visitDoctor();
    const payment = this.visitPayment();
    const from = this.visitFrom();
    const to = this.visitTo();

    return this.allVisits()
      .filter(a => {
        if (status && a.status !== status) return false;
        if (doctor && String(a.doctorId) !== doctor) return false;
        if (from && a.date < from) return false;
        if (to && a.date > to) return false;
        if (payment) {
          const p = paid.get(a.id);
          const state = p ? (p.amount > p.paid ? 'debt' : 'paid') : 'unpaid';
          if (state !== payment) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start))
      .map(a => {
        const payment = paid.get(a.id);
        return {
          ...a,
          dateLabel: this.dayFormat().format(fromDateKey(a.date)),
          statusKey: `schedule.status.${a.status}`,
          statusClass: PATIENT_STATUS_CLASSES[a.status],
          paymentKey: payment ? (payment.amount > payment.paid ? 'payments.badge.debt' : 'payments.badge.paid') : '',
          paymentOwes: !!payment && payment.amount > payment.paid
        };
      });
  });

  // ---- Вкладки диагнозов ----

  protected readonly activeTab = signal(0);

  protected selectTab(index: number): void {
    this.activeTab.set(index);
  }

  // ---- Режим изменения ----

  protected readonly editing = signal(false);
  protected readonly saving = signal(false);

  protected form: FormGroup | null = null;

  protected get diagnosesArray(): FormArray<FormGroup> {
    return this.form!.get('diagnoses') as FormArray<FormGroup>;
  }

  protected startEdit(): void {
    const patient = this.patient();
    if (!patient) return;

    // Изменяются общие данные и диагнозы — они в разделе «Обзор»
    this.section.set('overview');

    this.form = this.fb.nonNullable.group({
      fullName: [patient.fullName, [Validators.required, Validators.minLength(3)]],
      phone: [patient.phone, [Validators.required, uzPhoneValidator]],
      birthDate: [patient.birthDate],
      gender: [patient.gender as Gender],
      status: [patient.status as PatientStatus],
      doctorName: [patient.doctorName],
      diagnoses: this.fb.array(
        patient.diagnoses.map(d => this.fb.nonNullable.group({
          id: [d.id],
          title: [d.title, Validators.required],
          tooth: [d.tooth ?? null as number | null],
          description: [d.description]
        }))
      )
    });

    this.editing.set(true);
  }

  protected cancelEdit(): void {
    this.editing.set(false);
    this.form = null;
  }

  protected isInvalid(name: string): boolean {
    const control = this.form?.get(name);
    return !!control && control.invalid && control.touched;
  }

  protected save(): void {
    const patient = this.patient();
    if (!this.form || !patient) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();

    // Изменённые поля диагнозов накладываем на исходные (дата, врач, состояние не меняются)
    const diagnoses = patient.diagnoses.map(d => {
      const changed = value.diagnoses.find((item: { id: number }) => item.id === d.id);
      return changed
        ? { ...d, title: changed.title.trim(), tooth: changed.tooth || undefined, description: changed.description.trim() }
        : d;
    });

    this.saving.set(true);

    this.patientsService.update(patient.id, {
      fullName: value.fullName.trim(),
      phone: value.phone.trim(),
      birthDate: value.birthDate,
      gender: value.gender,
      status: value.status,
      doctorName: value.doctorName,
      diagnoses
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.cancelEdit();
        this.feedback.success('feedback.patientUpdated');
      },
      error: () => {
        this.saving.set(false);
        this.feedback.error();
      }
    });
  }
}
