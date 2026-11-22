import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Observable, filter, finalize, switchMap } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { CONFIRM_DIALOG_CONFIG, ConfirmDialog, ConfirmDialogData } from '../../../../shared/components/confirm-dialog/confirm-dialog';
import { ClinicServicesService, VisitServiceDraft } from '../../../../shared/services/clinic-services.service';
import { DoctorsService } from '../../../doctors/services/doctors.service';
import { formatMoney } from '../../../payments/services/payments.service';
import { VisitService } from '../../../schedule/models/appointment-form.model';
import { SERVICE_FORM_DIALOG_CONFIG, ServiceFormData, ServiceFormDialog } from '../../components/service-form-dialog/service-form-dialog';
import { TOOTH_STATE_FORM_DIALOG_CONFIG, ToothStateFormData, ToothStateFormDialog } from '../../components/tooth-state-form-dialog/tooth-state-form-dialog';
import { HEALTHY_STATE_ID, TOOTH_COLOR_CLASSES, ToothStateDraft, ToothStateItem, ToothStatesService } from '../../../../shared/services/tooth-states.service';
import { Theme, ThemeService } from '../../../../core/theme/theme.service';
import { FeedbackService } from '../../../../shared/services/feedback.service';
import { ClinicSettings } from '../../models/settings.model';
import { SettingsService } from '../../services/settings.service';
import { DashboardPrefsService } from '../../../dashboard/services/dashboard-prefs.service';
import { UsersService } from '../../services/users.service';
import { USER_FORM_DIALOG_CONFIG, UserFormData, UserFormDialog, UserFormResult } from '../../components/user-form-dialog/user-form-dialog';
import { UserCreate } from '../../services/users.service';
import { User } from '../../../../core/models/auth.model';
import { Validators } from '@angular/forms';
import { UzPhoneInputDirective } from '../../../../shared/directives/uz-phone-input.directive';

type ThemeChoice = Theme | 'system';

type SettingsTab = 'clinic' | 'appearance' | 'notifications' | 'services' | 'dictionaries' | 'workMode' | 'users' | 'account';

const LOCALES: Record<string, string> = { ru: 'ru-RU', uz: 'uz-Latn-UZ' };

// Режим работы: хотя бы один день и конец позже начала
function workModeValidator(group: AbstractControl): ValidationErrors | null {
  const days = group.get('workDays')?.value as number[];
  const start = group.get('workStart')?.value as string;
  const end = group.get('workEnd')?.value as string;
  const errors: ValidationErrors = {};
  if (!days?.length) errors['workDays'] = true;
  if (start && end && end <= start) errors['timeRange'] = true;
  return Object.keys(errors).length ? errors : null;
}

@Component({
  imports: [ReactiveFormsModule, MatIconModule, TranslocoPipe, UzPhoneInputDirective],
  selector: 'app-settings',
  templateUrl: './settings.html',
})
export class Settings {
  private readonly fb = inject(FormBuilder);
  private readonly settingsService = inject(SettingsService);
  private readonly themeService = inject(ThemeService);
  private readonly transloco = inject(TranslocoService);
  private readonly feedback = inject(FeedbackService);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);
  private readonly clinicServices = inject(ClinicServicesService);
  private readonly doctorsService = inject(DoctorsService);
  protected readonly dashboardPrefs = inject(DashboardPrefsService);
  private readonly toothStatesService = inject(ToothStatesService);

  private readonly langValue = toSignal(this.transloco.langChanges$, { initialValue: this.transloco.getActiveLang() });
  private readonly locale = computed(() => LOCALES[this.langValue()] ?? 'ru-RU');

  // Вход как врач — добавляется вкладка «Режим работы»
  protected readonly isDoctor = computed(() => this.auth.user()?.role === 'doctor');

  // ---- Вкладки ----

  protected readonly tabs = computed(() => [
    { id: 'clinic' as SettingsTab, key: 'settings.sections.clinic', icon: 'apartment' },
    { id: 'appearance' as SettingsTab, key: 'settings.sections.appearance', icon: 'palette' },
    { id: 'notifications' as SettingsTab, key: 'settings.sections.notifications', icon: 'notifications' },
    { id: 'services' as SettingsTab, key: 'settings.sections.services', icon: 'medical_services' },
    { id: 'dictionaries' as SettingsTab, key: 'settings.sections.dictionaries', icon: 'menu_book' },
    ...(this.isDoctor() ? [{ id: 'workMode' as SettingsTab, key: 'settings.sections.workMode', icon: 'schedule' }] : []),
    ...(this.auth.user()?.role === 'owner' ? [{ id: 'users' as SettingsTab, key: 'settings.sections.users', icon: 'manage_accounts' }] : []),
    { id: 'account' as SettingsTab, key: 'settings.sections.account', icon: 'lock' }
  ]);

  protected readonly tab = signal<SettingsTab>('clinic');

  protected setTab(tab: SettingsTab): void {
    this.tab.set(tab);
    if (tab === 'users') this.usersService.reload();
  }

  // Кнопки «Сохранить / Отменить» общей формы — только на вкладках клиники и уведомлений
  protected readonly showFormActions = computed(() => this.isOwner() && (this.tab() === 'clinic' || this.tab() === 'notifications'));

  protected readonly form = this.fb.nonNullable.group({
    name: [''],
    phone: [''],
    address: [''],
    openTime: ['09:00'],
    closeTime: ['18:00'],
    timezone: ['Asia/Tashkent'],
    currency: this.fb.nonNullable.control<ClinicSettings['currency']>('UZS'),
    notifications: this.fb.nonNullable.group({
      sms24h: [true],
      sms2h: [true],
      doctorNewAppointment: [true],
      dailyReport: [false]
    })
  });

  protected readonly notificationItems = [
    { control: 'sms24h', key: 'settings.notifications.sms24h' },
    { control: 'sms2h', key: 'settings.notifications.sms2h' },
    { control: 'doctorNewAppointment', key: 'settings.notifications.doctorNewAppointment' },
    { control: 'dailyReport', key: 'settings.notifications.dailyReport' }
  ] as const;

  protected readonly saving = signal(false);

  // ---- Внешний вид: язык и тема применяются сразу ----

  protected readonly lang = signal(this.transloco.getActiveLang());
  protected readonly themeChoice = signal<ThemeChoice>(this.themeService.isSystem() ? 'system' : this.themeService.theme());

  protected readonly themes: { value: ThemeChoice; key: string }[] = [
    { value: 'light', key: 'settings.appearance.light' },
    { value: 'dark', key: 'settings.appearance.dark' },
    { value: 'system', key: 'settings.appearance.system' }
  ];

  // Клинику, услуги и справочники меняет только владелец (остальным — просмотр)
  protected readonly isOwner = computed(() => this.auth.user()?.role === 'owner');

  constructor() {
    // Настройки и график врача приходят с API — подставляем в формы, когда загрузятся
    effect(() => {
      const settings = this.settingsService.settings();
      untracked(() => {
        if (!this.form.dirty) this.form.reset(settings);
      });
    });
    effect(() => {
      this.currentDoctor();
      untracked(() => {
        if (!this.workForm.dirty) this.resetWorkMode();
      });
    });
  }

  protected setLang(lang: 'ru' | 'uz'): void {
    this.transloco.setActiveLang(lang);
    this.lang.set(lang);
  }

  protected setTheme(choice: ThemeChoice): void {
    this.themeChoice.set(choice);
    if (choice === 'system') {
      this.themeService.useSystem();
    } else {
      this.themeService.set(choice);
    }
  }

  protected reset(): void {
    this.form.reset(this.settingsService.settings());
  }

  protected save(): void {
    this.saving.set(true);
    this.settingsService.save(this.form.getRawValue())
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.form.markAsPristine();
          this.feedback.success('feedback.settingsSaved');
        },
        error: err => this.feedback.error(err)
      });
  }

  // ---- Услуги (справочник для формы записи и формы врача) ----

  protected readonly services = computed(() =>
    this.clinicServices.services().map(service => ({
      ...service,
      priceLabel: formatMoney(service.price ?? 0, this.locale())
    }))
  );

  protected openService(service?: VisitService): void {
    this.dialog
      .open<ServiceFormDialog, ServiceFormData, VisitServiceDraft>(ServiceFormDialog, { ...SERVICE_FORM_DIALOG_CONFIG, data: { service } })
      .afterClosed()
      .pipe(
        filter((draft): draft is VisitServiceDraft => !!draft),
        switchMap((draft): Observable<unknown> => service ? this.clinicServices.update(service.id, draft) : this.clinicServices.add(draft))
      )
      .subscribe({
        next: () => this.feedback.success(service ? 'feedback.updated' : 'settings.services.created'),
        error: err => this.feedback.error(err)
      });
  }

  protected removeService(service: VisitService): void {
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
        ...CONFIRM_DIALOG_CONFIG,
        data: {
          titleKey: 'settings.services.deleteTitle',
          messageKey: 'settings.services.deleteMessage',
          messageParams: { name: service.name },
          confirmKey: 'finance.delete',
          cancelKey: 'common.cancel',
          danger: true
        }
      })
      .afterClosed()
      .pipe(
        filter(Boolean),
        switchMap(() => this.clinicServices.remove(service.id))
      )
      .subscribe({
        next: () => this.feedback.success('settings.services.deleted'),
        error: err => this.feedback.error(err)
      });
  }

  // ---- Справочники: состояния зубов (для зубной формулы пациента) ----

  protected readonly toothStates = computed(() =>
    this.toothStatesService.states().map(item => ({
      ...item,
      key: `dentalChart.states.${item.id}`,
      classes: TOOTH_COLOR_CLASSES[item.color],
      // «Здоров» — базовое состояние (зуб без отметки), удалить нельзя
      isBase: item.id === HEALTHY_STATE_ID
    }))
  );

  private toothStateName(state: ToothStateItem): string {
    return state.name || this.transloco.translate(`dentalChart.states.${state.id}`);
  }

  protected openToothState(state?: ToothStateItem): void {
    this.dialog
      .open<ToothStateFormDialog, ToothStateFormData, ToothStateDraft>(ToothStateFormDialog, { ...TOOTH_STATE_FORM_DIALOG_CONFIG, data: { state } })
      .afterClosed()
      .pipe(
        filter((draft): draft is ToothStateDraft => !!draft),
        switchMap((draft): Observable<unknown> => state ? this.toothStatesService.update(state.id, draft) : this.toothStatesService.add(draft))
      )
      .subscribe({
        next: () => this.feedback.success(state ? 'feedback.updated' : 'settings.dictionaries.created'),
        error: err => this.feedback.error(err)
      });
  }

  protected removeToothState(state: ToothStateItem): void {
    if (state.id === HEALTHY_STATE_ID) return;
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
        ...CONFIRM_DIALOG_CONFIG,
        data: {
          titleKey: 'settings.dictionaries.deleteTitle',
          messageKey: 'settings.dictionaries.deleteMessage',
          messageParams: { name: this.toothStateName(state) },
          confirmKey: 'finance.delete',
          cancelKey: 'common.cancel',
          danger: true
        }
      })
      .afterClosed()
      .pipe(
        filter(Boolean),
        switchMap(() => this.toothStatesService.remove(state.id))
      )
      .subscribe({
        next: () => this.feedback.success('settings.dictionaries.deleted'),
        error: err => this.feedback.error(err)
      });
  }

  // ---- Режим работы врача ----

  private readonly currentDoctor = computed(() => {
    const doctorId = this.auth.user()?.doctorId;
    return doctorId ? this.doctorsService.doctors().find(d => d.id === doctorId) ?? null : null;
  });

  protected readonly workForm = this.fb.nonNullable.group({
    workDays: this.fb.nonNullable.control<number[]>([1, 2, 3, 4, 5]),
    workStart: ['09:00'],
    workEnd: ['18:00']
  }, { validators: workModeValidator });

  private readonly workDaysValue = toSignal(this.workForm.controls.workDays.valueChanges, {
    initialValue: this.workForm.controls.workDays.value
  });

  // Пн … Вс, короткие названия на текущем языке (1 — пн … 7 — вс)
  protected readonly weekDays = computed(() => {
    const format = new Intl.DateTimeFormat(this.locale(), { weekday: 'short' });
    const selected = this.workDaysValue();
    // 2024-01-01 — понедельник
    return [1, 2, 3, 4, 5, 6, 7].map(day => ({
      day,
      label: format.format(new Date(2024, 0, day)).replace('.', ''),
      active: selected.includes(day)
    }));
  });

  protected toggleWorkDay(day: number): void {
    const control = this.workForm.controls.workDays;
    const days = control.value;
    control.setValue(days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort((a, b) => a - b));
    control.markAsDirty();
  }

  protected readonly workSaving = signal(false);

  protected resetWorkMode(): void {
    const doctor = this.currentDoctor();
    this.workForm.reset(doctor
      ? { workDays: doctor.workDays, workStart: doctor.workStart, workEnd: doctor.workEnd }
      : { workDays: [1, 2, 3, 4, 5], workStart: '09:00', workEnd: '18:00' });
  }

  // PATCH /doctors/:id (график врача)
  protected saveWorkMode(): void {
    const doctorId = this.auth.user()?.doctorId;
    if (!doctorId || this.workForm.invalid) {
      this.workForm.markAllAsTouched();
      return;
    }
    this.workSaving.set(true);
    this.doctorsService.update(doctorId, this.workForm.getRawValue())
      .pipe(finalize(() => this.workSaving.set(false)))
      .subscribe({
        next: () => {
          this.workForm.markAsPristine();
          this.feedback.success('feedback.settingsSaved');
        },
        error: err => this.feedback.error(err)
      });
  }

  // ---- Пользователи (только владелец) ----

  private readonly usersService = inject(UsersService);

  protected readonly users = computed(() =>
    [...this.usersService.users()]
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'))
      .map(user => ({ ...user, roleKey: `roles.${user.role}`, isSelf: user.id === this.auth.user()?.id }))
  );

  protected openUser(user?: User): void {
    this.dialog
      .open<UserFormDialog, UserFormData, UserFormResult>(UserFormDialog, { ...USER_FORM_DIALOG_CONFIG, data: { user } })
      .afterClosed()
      .pipe(
        filter((result): result is UserFormResult => !!result),
        switchMap((result): Observable<unknown> => user ? this.usersService.update(user.id, result) : this.usersService.create(result as UserCreate))
      )
      .subscribe({
        next: () => this.feedback.success(user ? 'feedback.updated' : 'settings.users.created'),
        error: err => this.feedback.error(err)
      });
  }

  // Блокировка сразу запрещает вход (refresh-токены пользователя аннулируются)
  protected toggleActive(user: User): void {
    this.usersService.update(user.id, { active: user.active === false }).subscribe({
      next: updated => this.feedback.success(updated.active === false ? 'settings.users.blocked' : 'settings.users.unblocked'),
      error: err => this.feedback.error(err)
    });
  }

  // ---- Учётная запись: смена своего пароля ----

  protected readonly passwordForm = this.fb.nonNullable.group({
    oldPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(6)]]
  });

  protected readonly passwordSaving = signal(false);

  protected changePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    const { oldPassword, newPassword } = this.passwordForm.getRawValue();
    this.passwordSaving.set(true);
    this.auth.changePassword(oldPassword, newPassword)
      .pipe(finalize(() => this.passwordSaving.set(false)))
      .subscribe({
        next: () => {
          this.passwordForm.reset();
          this.feedback.success('settings.account.changed');
        },
        error: err => this.feedback.error(err)
      });
  }
}
