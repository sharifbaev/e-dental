import { Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Observable, filter, finalize, switchMap } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { apiError } from '../../../../core/api/api';
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
import { ClinicSettings, OffsetUnit, SmsModeration, SmsLanguage, SmsReminder, StatusReminder, UiScale, birthdayTemplate, reminderTemplate } from '../../models/settings.model';
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

// Одно SMS-напоминание пациенту в форме: за сколько до визита и текст
// Ограничения сервера: не больше 30 дней до визита, текст до 480 символов, напоминаний до 5
const UNIT_MINUTES: Record<OffsetUnit, number> = { minutes: 1, hours: 60, days: 1440 };
const MAX_OFFSET_MINUTES = 30 * 1440;
export const SMS_TEXT_MAX = 480;
export const MAX_REMINDERS = 5;

function offsetMaxValidator(group: AbstractControl): ValidationErrors | null {
  const { value, unit } = group.value as { value: number; unit: OffsetUnit };
  return value * UNIT_MINUTES[unit ?? 'minutes'] > MAX_OFFSET_MINUTES ? { max: true } : null;
}

function reminderGroup(fb: NonNullableFormBuilder, reminder: SmsReminder) {
  return fb.group({
    value: [reminder.value, [Validators.required, Validators.min(1)]],
    unit: fb.control<OffsetUnit>(reminder.unit),
    text: [reminder.text, [Validators.required, Validators.maxLength(SMS_TEXT_MAX)]]
  }, { validators: offsetMaxValidator });
}

// Пункты меню, которые можно скрыть («Настройки» — всегда видны)
const MENU_ITEMS = [
  { path: '/dashboard', key: 'menu.dashboard', icon: 'dashboard', staffOnly: false },
  { path: '/schedule', key: 'menu.schedule', icon: 'calendar_month', staffOnly: false },
  { path: '/calendar', key: 'menu.calendar', icon: 'calendar_view_day', staffOnly: false },
  { path: '/patients', key: 'menu.patients', icon: 'groups', staffOnly: false },
  { path: '/doctors', key: 'menu.doctors', icon: 'stethoscope', staffOnly: true },
  { path: '/finance', key: 'menu.finance', icon: 'account_balance_wallet', staffOnly: true },
  { path: '/sms', key: 'menu.sms', icon: 'sms', staffOnly: true }
];

// Цвета статуса проверки текста SMS
const MODERATION_CLASSES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  approved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  rejected: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300'
};

// Логотип: картинка до 2 МБ
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

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
  imports: [NgTemplateOutlet, RouterLink, ReactiveFormsModule, MatIconModule, TranslocoPipe, UzPhoneInputDirective],
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

  // Нажатие на вкладку — плавно прокручиваем к разделу; пока идёт прокрутка, отслеживание раздела не перебивает выбор
  private spyPausedUntil = 0;

  protected setTab(tab: SettingsTab): void {
    this.tab.set(tab);
    this.spyPausedUntil = Date.now() + 800;
    document.getElementById(tab)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Кнопки «Сохранить / Отменить» общей формы (клиника и уведомления) — под формой, только владельцу
  protected readonly showFormActions = computed(() => this.isOwner());

  private readonly tabsNav = viewChild<ElementRef<HTMLElement>>('tabsNav');

  // Лента вкладок прилипла к верху экрана (мобилка) — тогда добавляем отступ сверху
  private readonly tabsBand = viewChild<ElementRef<HTMLElement>>('tabsBand');
  protected readonly tabsStuck = signal(false);
  protected readonly tabsMobile = signal(false);
  // Отступ ленты от верха: листают вниз — 12px, вверх — 8px
  protected readonly tabsGap = signal(12);
  private readonly stuckWatcher = afterNextRender(() => {
    let lastY = window.scrollY;
    const check = () => {
      const band = this.tabsBand()?.nativeElement;
      const mobile = window.matchMedia('(max-width: 767px)').matches;
      const y = window.scrollY;
      if (y > lastY + 2) this.tabsGap.set(12);
      else if (y < lastY - 2) this.tabsGap.set(8);
      lastY = y;
      this.tabsMobile.set(mobile);
      this.tabsStuck.set(mobile && !!band && y > 0 && band.getBoundingClientRect().top <= 12.5); // 12 — наибольший отступ (пока он плавно меняется)
    };
    window.addEventListener('scroll', check, { passive: true });
    check();
    this.destroyRef.onDestroy(() => window.removeEventListener('scroll', check));
  });
  private readonly destroyRef = inject(DestroyRef);

  // Выбранная вкладка — в центр ленты (мобилка); на ПК список вертикальный, двигать нечего
  private readonly centerActiveTab = effect(() => {
    const tab = this.tab();
    const nav = this.tabsNav()?.nativeElement;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const button = nav.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
    if (!button) return;
    nav.scrollTo({ left: button.offsetLeft - (nav.clientWidth - button.offsetWidth) / 2, behavior: 'smooth' });
  });

  // Прокрутка страницы: выбранной становится вкладка раздела, который сейчас вверху экрана
  private readonly scrollSpy = afterNextRender(() => {
    if (this.isOwner()) this.usersService.reload();
    const ids = this.tabs().map(t => t.id);
    const visible = new Set<SettingsTab>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = entry.target.id as SettingsTab;
        if (entry.isIntersecting) visible.add(id);
        else visible.delete(id);
      }
      if (Date.now() < this.spyPausedUntil) return;
      // Долистали до конца — последний раздел, даже если он короткий и не доходит до верха
      const scroller = document.scrollingElement;
      const atBottom = !!scroller && scroller.scrollTop + window.innerHeight >= scroller.scrollHeight - 4;
      const current = atBottom ? [...ids].reverse().find(id => visible.has(id)) : ids.find(id => visible.has(id));
      if (current && current !== this.tab()) this.tab.set(current);
    }, { rootMargin: '-115px 0px -55% 0px' });
    for (const id of ids) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
    this.destroyRef.onDestroy(() => observer.disconnect());
  });

  protected readonly form = this.fb.nonNullable.group({
    name: [''],
    phone: [''],
    address: [''],
    openTime: ['09:00'],
    closeTime: ['18:00'],
    timezone: ['Asia/Tashkent'],
    currency: this.fb.nonNullable.control<ClinicSettings['currency']>('UZS'),
    logoUrl: this.fb.control<string | null>(null),
    notifications: this.fb.nonNullable.group({
      // Старые флаги — не показываются, уходят на сервер как пришли
      sms24h: [true],
      sms2h: [true],
      doctorNewAppointment: [true],
      dailyReport: [false],
      smsLanguage: this.fb.nonNullable.control<SmsLanguage>('ru'),
      patientSms: this.fb.nonNullable.group({
        enabled: [false],
        reminders: this.fb.nonNullable.array<ReturnType<typeof reminderGroup>>([])
      }),
      birthdaySms: this.fb.nonNullable.group({
        enabled: [false],
        time: ['10:00'],
        text: ['', [Validators.required, Validators.maxLength(SMS_TEXT_MAX)]]
      })
    })
  });

  protected readonly saving = signal(false);

  // ---- Внешний вид: язык и тема применяются сразу ----

  protected readonly lang = signal(this.transloco.getActiveLang());
  protected readonly themeChoice = signal<ThemeChoice>(this.themeService.isSystem() ? 'system' : this.themeService.theme());

  // Тема: только названия, без мини-превью
  protected readonly themes: { value: ThemeChoice; key: string }[] = [
    { value: 'light', key: 'settings.appearance.light' },
    { value: 'dark', key: 'settings.appearance.dark' }
  ];

  // «Как в системе», выбранное раньше, — подсвечиваем тему, которая сейчас действует
  protected readonly activeTheme = computed(() => (this.themeChoice() === 'system' ? this.themeService.theme() : this.themeChoice()));

  // Масштаб интерфейса
  protected readonly uiScales: { value: UiScale; key: string }[] = [
    { value: 'compact', key: 'settings.appearance.scale.compact' },
    { value: 'normal', key: 'settings.appearance.scale.normal' },
    { value: 'large', key: 'settings.appearance.scale.large' }
  ];

  // Меню: какие пункты показывать (врачу «Врачи» и «Финансы» недоступны вообще)
  protected readonly menuItems = computed(() => MENU_ITEMS.filter(item => !item.staffOnly || !this.isDoctor()));

  protected isMenuVisible(path: string): boolean {
    return !this.dashboardPrefs.hiddenMenu().includes(path);
  }

  // Стартовая страница — только из видимых пунктов (и «Настройки»)
  protected readonly startPages = computed(() => [
    ...this.menuItems().filter(item => this.isMenuVisible(item.path)),
    { path: '/settings', key: 'menu.settings', icon: 'settings', staffOnly: false }
  ]);

  protected readonly offsetUnits: { value: OffsetUnit; key: string }[] = [
    { value: 'minutes', key: 'settings.notifications.units.minutes' },
    { value: 'hours', key: 'settings.notifications.units.hours' },
    { value: 'days', key: 'settings.notifications.units.days' }
  ];

  // Клинику, услуги и справочники меняет только владелец (остальным — просмотр)
  protected readonly isOwner = computed(() => this.auth.user()?.role === 'owner');

  constructor() {
    // Настройки и график врача приходят с API — подставляем в формы, когда загрузятся
    effect(() => {
      const settings = this.settingsService.settings();
      untracked(() => {
        if (!this.form.dirty) this.applySettings(settings);
      });
    });
    this.form.controls.notifications.controls.patientSms.controls.enabled.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(enabled => this.onPatientSmsToggle(enabled));
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
    this.applySettings(this.settingsService.settings());
  }

  // reset() не меняет длину FormArray — сначала подгоняем список напоминаний, затем сбрасываем форму
  private applying = false;

  private applySettings(settings: ClinicSettings): void {
    this.applying = true;
    const n = settings.notifications;
    const lang = n.smsLanguage;
    const reminders = n.patientSms.reminders.map(r => ({ ...r, text: r.text || this.reminderText(lang, settings) }));
    this.reminders.clear({ emitEvent: false });
    reminders.forEach(r => this.reminders.push(reminderGroup(this.fb.nonNullable, r), { emitEvent: false }));
    this.form.reset({
      ...settings,
      notifications: {
        ...n,
        patientSms: { enabled: n.patientSms.enabled, reminders },
        birthdaySms: { ...n.birthdaySms, text: n.birthdaySms.text || this.birthdayText(lang, settings) }
      }
    });
    this.syncRemindersEnabled();
    this.applying = false;
  }

  // Выключенные SMS не проверяем при сохранении (отключённые поля не влияют на валидность)
  private syncRemindersEnabled(): void {
    if (this.notifications.patientSms.controls.enabled.value) this.reminders.enable({ emitEvent: false });
    else this.reminders.disable({ emitEvent: false });
    // Текст поздравления обязателен, только когда поздравления включены
    const birthday = this.notifications.birthdaySms.controls;
    if (birthday.enabled.value) birthday.text.enable({ emitEvent: false });
    else birthday.text.disable({ emitEvent: false });
  }

  // ---- Проверка текстов SMS у провайдера ----

  // Статус для текста в форме: сохранённый текст — статус с сервера; изменённый — «уйдёт на проверку после сохранения»
  protected moderationOf(text: string, saved: { text: string; moderation?: SmsModeration | null }[]): { key: string; classes: string; comment?: string | null } | null {
    const value = text.trim();
    if (!value) return null;
    const match = saved.find(item => item.text.trim() === value);
    if (!match) return { key: 'settings.notifications.moderation.changed', classes: 'bg-page text-soft' };
    const moderation = match.moderation;
    if (!moderation) return null;
    return {
      key: `settings.notifications.moderation.${moderation.status}`,
      classes: MODERATION_CLASSES[moderation.status] ?? 'bg-page text-soft',
      comment: moderation.status === 'rejected' ? moderation.comment : null
    };
  }

  protected readonly savedReminders = computed(() => this.settingsService.settings().notifications.patientSms.reminders);
  protected readonly savedBirthday = computed(() => {
    const birthday = this.settingsService.settings().notifications.birthdaySms;
    return birthday.text ? [birthday] : [];
  });

  protected readonly smsTextMax = SMS_TEXT_MAX;
  protected readonly maxReminders = MAX_REMINDERS;

  // Сервер не отправляет SMS с пустым текстом: если в сохранённых настройках он пустой
  // (перенос со старых sms24h/sms2h), владельцу нужно один раз нажать «Сохранить»
  protected readonly smsNeedsSave = computed(() => {
    const n = this.settingsService.settings().notifications;
    return this.settingsService.loaded() && (
      (n.patientSms.enabled && n.patientSms.reminders.some(r => !r.text.trim())) ||
      (n.birthdaySms.enabled && !n.birthdaySms.text.trim())
    );
  });

  // Перед повторным сохранением снимаем прошлые ошибки сервера — их заново проверит сам сервер
  private clearServerErrors(): void {
    const controls: AbstractControl[] = [
      this.reminders,
      ...this.reminders.controls.flatMap(group => [group.controls.value, group.controls.text]),
      this.notifications.birthdaySms.controls.time,
      this.notifications.birthdaySms.controls.text,
      this.notifications.smsLanguage
    ];
    for (const control of controls) {
      if (control.hasError('server')) control.updateValueAndValidity({ emitEvent: false });
    }
  }

  // Ошибка проверки с сервера (422): подсвечиваем поле, на которое он указал
  private showServerFieldError(err: unknown): void {
    const fields = apiError(err)?.fields;
    if (!fields) return;
    for (const [path, code] of Object.entries(fields)) {
      const reminder = /^(?:notifications\.)?(?:patientSms\.)?reminders\[(\d+)\]\.(value|text)$/.exec(path);
      const control: AbstractControl | null = reminder
        ? this.reminders.at(Number(reminder[1]))?.get(reminder[2]) ?? null
        : /reminders$/.test(path) ? this.reminders
        : /birthdaySms\.time$/.test(path) ? this.notifications.birthdaySms.controls.time
        : /birthdaySms\.text$/.test(path) ? this.notifications.birthdaySms.controls.text
        : /smsLanguage$/.test(path) ? this.notifications.smsLanguage
        : null;
      if (!control) continue;
      control.setErrors({ ...control.errors, server: code });
      control.markAsTouched();
    }
    document.getElementById('notifications')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---- Клиника: логотип ----

  protected readonly logoUrl = computed(() => this.settingsService.settings().logoUrl);
  protected readonly logoUploading = signal(false);

  // Выбранный, но ещё не сохранённый логотип: сначала показываем «Сейчас → Новый», затем «Сохранить»
  protected readonly pendingLogo = signal<{ file: File; url: string } | null>(null);

  protected onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.feedback.error('settings.clinic.logoWrongType', 'settings.clinic.logoRules');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      this.feedback.error('settings.clinic.logoTooBig', 'settings.clinic.logoRules');
      return;
    }
    this.clearPendingLogo();
    this.pendingLogo.set({ file, url: URL.createObjectURL(file) });
  }

  protected saveLogo(): void {
    const pending = this.pendingLogo();
    if (!pending) return;
    this.logoUploading.set(true);
    this.settingsService.uploadLogo(pending.file)
      .pipe(finalize(() => this.logoUploading.set(false)))
      .subscribe({
        next: () => {
          this.clearPendingLogo();
          this.feedback.success('settings.clinic.logoSaved');
        },
        error: err => this.feedback.error(err)
      });
  }

  protected clearPendingLogo(): void {
    const pending = this.pendingLogo();
    if (pending) URL.revokeObjectURL(pending.url);
    this.pendingLogo.set(null);
  }

  // Удалить свой логотип (после подтверждения) — вернётся стандартный
  protected removeLogo(): void {
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
        ...CONFIRM_DIALOG_CONFIG,
        data: {
          titleKey: 'settings.clinic.logoDeleteTitle',
          messageKey: 'settings.clinic.logoDeleteMessage',
          confirmKey: 'finance.delete',
          cancelKey: 'common.cancel',
          danger: true
        }
      })
      .afterClosed()
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.logoUploading.set(true);
          return this.settingsService.removeLogo().pipe(finalize(() => this.logoUploading.set(false)));
        })
      )
      .subscribe({
        next: () => this.feedback.success('settings.clinic.logoRemoved'),
        error: err => this.feedback.error(err)
      });
  }

  private readonly revokePendingLogo = inject(DestroyRef).onDestroy(() => this.clearPendingLogo());

  // ---- Уведомления: SMS пациенту ----

  protected get notifications() {
    return this.form.controls.notifications.controls;
  }

  protected get reminders() {
    return this.form.controls.notifications.controls.patientSms.controls.reminders;
  }

  // Название и телефон — из вкладки «Клиника» (то, что сейчас в форме)
  private reminderText(lang: SmsLanguage, source: Pick<ClinicSettings, 'name' | 'phone'> = this.form.getRawValue()): string {
    // Телефон клиники может прийти и с кодом страны ('+998 90 …'), и без него ('90 …')
    const phone = source.phone.trim();
    return reminderTemplate(lang, source.name, !phone ? '' : phone.startsWith('+') ? phone : `+998 ${phone}`);
  }

  private birthdayText(lang: SmsLanguage, source: Pick<ClinicSettings, 'name'> = this.form.getRawValue()): string {
    return birthdayTemplate(lang, source.name);
  }

  // Включили SMS пациенту — сразу одно напоминание за 1 день
  private onPatientSmsToggle(enabled: boolean): void {
    if (this.applying) return;
    if (enabled && this.reminders.length === 0) this.addReminder({ value: 1, unit: 'days' });
    this.syncRemindersEnabled();
  }

  protected addReminder(preset: Pick<SmsReminder, 'value' | 'unit'> = { value: 1, unit: 'hours' }): void {
    if (this.reminders.length >= MAX_REMINDERS) return;
    const lang = this.notifications.smsLanguage.value;
    this.reminders.push(reminderGroup(this.fb.nonNullable, { ...preset, text: this.reminderText(lang) }));
    this.form.markAsDirty();
  }

  // Последнее напоминание не удаляем — для этого есть переключатель
  protected removeReminder(index: number): void {
    if (this.reminders.length <= 1) return;
    this.reminders.removeAt(index);
    this.form.markAsDirty();
  }

  // Язык SMS: примерные тексты, которые врач не менял, переводятся на выбранный язык
  protected setSmsLanguage(lang: SmsLanguage): void {
    const control = this.notifications.smsLanguage;
    const previous = control.value;
    if (previous === lang) return;
    for (const group of this.reminders.controls) {
      const text = group.controls.text;
      if (!text.value.trim() || text.value === this.reminderText(previous)) text.setValue(this.reminderText(lang));
    }
    const birthday = this.notifications.birthdaySms.controls.text;
    if (!birthday.value.trim() || birthday.value === this.birthdayText(previous)) birthday.setValue(this.birthdayText(lang));
    control.setValue(lang);
    this.form.markAsDirty();
  }

  // Вставить примерный текст заново (если врач стёр свой)
  protected restoreReminderText(index: number): void {
    this.reminders.at(index).controls.text.setValue(this.reminderText(this.notifications.smsLanguage.value));
    this.form.markAsDirty();
  }

  protected restoreBirthdayText(): void {
    this.notifications.birthdaySms.controls.text.setValue(this.birthdayText(this.notifications.smsLanguage.value));
    this.form.markAsDirty();
  }

  // ---- Уведомления врачу: напомнить обновить статус (личная настройка, сохраняется сразу) ----

  protected readonly statusReminderItems = [
    { key: 'primary' as const, title: 'settings.notifications.statusPrimary' },
    { key: 'awaitingDecision' as const, title: 'settings.notifications.statusAwaiting' }
  ];

  protected setStatusReminder(key: 'primary' | 'awaitingDecision', patch: Partial<StatusReminder>): void {
    if (patch.value !== undefined && (!Number.isFinite(patch.value) || patch.value < 1)) return;
    this.dashboardPrefs.setStatusReminder(key, patch);
  }

  protected save(): void {
    this.clearServerErrors();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    // Логотип сохраняется отдельно (сразу при загрузке) — берём актуальный
    this.settingsService.save({ ...this.form.getRawValue(), logoUrl: this.settingsService.settings().logoUrl })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        // Сервер может поправить данные (например, убрать повторяющиеся напоминания) — показываем то, что он сохранил
        next: saved => {
          this.applySettings(saved);
          this.feedback.success('feedback.settingsSaved');
        },
        error: err => {
          this.showServerFieldError(err);
          this.feedback.error(err);
        }
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
