import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { finalize } from 'rxjs';
import { Theme, ThemeService } from '../../../../core/theme/theme.service';
import { FeedbackService } from '../../../../shared/services/feedback.service';
import { ClinicSettings } from '../../models/settings.model';
import { SettingsService } from '../../services/settings.service';

type ThemeChoice = Theme | 'system';

@Component({
  imports: [ReactiveFormsModule, MatIconModule, TranslocoPipe],
  selector: 'app-settings',
  templateUrl: './settings.html',
})
export class Settings {
  private readonly fb = inject(FormBuilder);
  private readonly settingsService = inject(SettingsService);
  private readonly themeService = inject(ThemeService);
  private readonly transloco = inject(TranslocoService);
  private readonly feedback = inject(FeedbackService);

  // Разделы слева (ПК) — прокрутка к блоку
  protected readonly sections = [
    { id: 'clinic', key: 'settings.sections.clinic', icon: 'apartment' },
    { id: 'appearance', key: 'settings.sections.appearance', icon: 'palette' },
    { id: 'notifications', key: 'settings.sections.notifications', icon: 'notifications' }
  ];

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

  constructor() {
    this.form.reset(this.settingsService.settings());
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

  protected scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        error: () => this.feedback.error()
      });
  }
}
