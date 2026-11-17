import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogConfig, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ScheduleAppointment } from '../../../schedule/models/schedule.model';
import { AppointmentFormService } from '../../../schedule/services/appointment-form.service';
import { ScheduleService, addMinutes, toDateKey } from '../../../schedule/services/schedule.service';
import { SERVICE_PRICES } from '../../../payments/models/payment.model';
import { formatMoney } from '../../../payments/services/payments.service';
import { TreatmentPlanDialogResult } from '../../models/treatment-plan.model';

export interface TreatmentPlanDialogData {
  appointment: ScheduleAppointment;
}

// На ПК окно, на мобилке — на весь экран (как карточка пациента, см. styles.scss)
export const TREATMENT_PLAN_DIALOG_CONFIG: MatDialogConfig = {
  width: '560px',
  maxWidth: '100vw',
  maxHeight: '100dvh',
  autoFocus: false,
  panelClass: 'patient-details-dialog'
};

const LOCALES: Record<string, string> = { ru: 'ru-RU', uz: 'uz-Latn-UZ' };

// Рабочий день для свободных окон следующего приёма
const DAY_START = 9 * 60;
const DAY_END = 20 * 60;
const SLOT_STEP = 30;

const DURATIONS = [30, 45, 60];

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

@Component({
  selector: 'app-treatment-plan-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe],
  templateUrl: './treatment-plan-dialog.html',
  host: { class: 'flex flex-col h-full' }
})
export class TreatmentPlanDialog {
  protected readonly data = inject<TreatmentPlanDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<TreatmentPlanDialog, TreatmentPlanDialogResult>>(MatDialogRef);
  private readonly scheduleService = inject(ScheduleService);
  private readonly formService = inject(AppointmentFormService);
  private readonly transloco = inject(TranslocoService);
  private readonly fb = inject(FormBuilder);

  private readonly lang = toSignal(this.transloco.langChanges$, { initialValue: this.transloco.getActiveLang() });
  private readonly locale = computed(() => LOCALES[this.lang()] ?? 'ru-RU');

  protected readonly appointment = this.data.appointment;
  protected readonly durations = DURATIONS;
  protected readonly todayKey = toDateKey(new Date());

  // Услуги клиники — плитки процедур (без «Острой боли»: это повод визита, а не процедура)
  private readonly allServices = toSignal(this.formService.getVisitServices(), { initialValue: [] });
  protected readonly services = computed(() => this.allServices().filter(s => !s.urgent));

  // Выбранные процедуры: по умолчанию — услуга текущего приёма
  protected readonly selected = signal<number[]>([this.appointment.serviceId]);

  protected readonly form = this.fb.nonNullable.group({
    other: [''],                                   // свои процедуры через запятую
    visits: [3, [Validators.required, Validators.min(1), Validators.max(30)]],
    cost: [0, [Validators.required, Validators.min(0)]],
    notes: [''],
    withNext: [true],
    nextDate: [toDateKey(new Date(Date.now() + 7 * 86_400_000))],
    duration: [45],
    nextTime: ['']
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  // Стоимость подставляется по выбранным процедурам, пока её не изменили руками
  private costEdited = false;

  constructor() {
    this.updateCost();
  }

  protected isSelected(id: number): boolean {
    return this.selected().includes(id);
  }

  protected toggleService(id: number): void {
    this.selected.update(list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]));
    this.updateCost();
  }

  protected onCostInput(): void {
    this.costEdited = true;
  }

  private updateCost(): void {
    if (this.costEdited) return;
    const sum = this.selected().reduce((total, id) => total + (SERVICE_PRICES[id] ?? 0), 0);
    this.form.controls.cost.setValue(sum);
  }

  protected readonly costLabel = computed(() => formatMoney(this.value().cost ?? 0, this.locale()));

  // Свободные окна врача на выбранную дату под выбранную длительность
  protected readonly freeSlots = computed(() => {
    const { nextDate, duration = 45 } = this.value();
    if (!nextDate) return [];

    const now = new Date();
    const nowMinutes = nextDate === toDateKey(now) ? now.getHours() * 60 + now.getMinutes() : -1;
    const busy = this.scheduleService.appointments()
      .filter(a => a.doctorId === this.appointment.doctorId && a.date === nextDate && a.status !== 'cancelled' && a.status !== 'noShow')
      .map(a => [toMinutes(a.start), toMinutes(a.end)] as const);

    const slots: string[] = [];
    for (let start = DAY_START; start + duration <= DAY_END; start += SLOT_STEP) {
      const end = start + duration;
      if (start <= nowMinutes) continue;
      if (busy.some(([from, to]) => start < to && end > from)) continue;
      slots.push(fromMinutes(start));
    }
    return slots;
  });

  protected selectTime(time: string): void {
    this.form.controls.nextTime.setValue(time);
  }

  protected readonly submitted = signal(false);

  // Процедуры: выбранные плитки + свои через запятую
  private procedures(): string[] {
    const fromTiles = this.services().filter(s => this.selected().includes(s.id)).map(s => s.name);
    const own = this.form.controls.other.value.split(',').map(s => s.trim()).filter(Boolean);
    return [...fromTiles, ...own];
  }

  protected readonly proceduresMissing = computed(() => this.submitted() && this.selected().length === 0 && !(this.value().other ?? '').trim());
  protected readonly timeMissing = computed(() => this.submitted() && !!this.value().withNext && !this.value().nextTime);

  protected skip(): void {
    this.dialogRef.close('skip');
  }

  protected save(): void {
    this.submitted.set(true);
    const value = this.form.getRawValue();
    const procedures = this.procedures();

    if (this.form.invalid || procedures.length === 0 || (value.withNext && !value.nextTime)) {
      this.form.markAllAsTouched();
      return;
    }

    // Услуга следующего приёма — первая выбранная плитка, иначе «Консультация и осмотр»
    const firstService = this.services().find(s => this.selected().includes(s.id)) ?? this.services().find(s => s.id === 3);

    this.dialogRef.close({
      plan: {
        patientId: this.appointment.patientId,
        patientName: this.appointment.patientName,
        doctorId: this.appointment.doctorId,
        doctorName: this.appointment.doctorName,
        procedures,
        visits: value.visits,
        cost: value.cost,
        notes: value.notes.trim()
      },
      next: value.withNext ? {
        date: value.nextDate,
        time: value.nextTime,
        durationMinutes: value.duration,
        serviceId: firstService?.id ?? 3,
        serviceName: firstService?.name ?? procedures[0]
      } : null
    });
  }

  // Время окончания выбранного окна — для подписи
  protected readonly nextEnd = computed(() => {
    const { nextTime, duration = 45 } = this.value();
    return nextTime ? addMinutes(nextTime, duration) : '';
  });
}
