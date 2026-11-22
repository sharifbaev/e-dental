import { Directive, ElementRef, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

// Код страны показывается рядом с полем (как в форме записи), в поле вводятся только 9 цифр номера
export const UZ_PHONE_PREFIX = '+998';

// '901234567' → '90 123-45-67'
function formatLocalPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 9);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)];
  let result = parts[0];
  if (parts[1]) result += ' ' + parts[1];
  if (parts[2]) result += '-' + parts[2];
  if (parts[3]) result += '-' + parts[3];
  return result;
}

// Цифры номера без кода страны (вставленный номер с 998 — без кода)
function localDigits(value: unknown): string {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length > 9 && digits.startsWith('998')) digits = digits.slice(3);
  return digits.slice(0, 9);
}

// Поле телефона Узбекистана: в поле — '90 123-45-67', в форму уходит '+998 90 123-45-67' (формат моделей не меняется)
@Directive({
  selector: 'input[appUzPhone]',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => UzPhoneInputDirective), multi: true }],
  host: {
    type: 'tel',
    inputmode: 'numeric',
    maxlength: '12',
    '(input)': 'onInput()',
    '(blur)': 'onTouched()'
  }
})
export class UzPhoneInputDirective implements ControlValueAccessor {
  private readonly input = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private onChange: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  writeValue(value: unknown): void {
    this.input.value = formatLocalPhone(localDigits(value));
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.input.disabled = disabled;
  }

  protected onInput(): void {
    const local = formatLocalPhone(localDigits(this.input.value));
    this.input.value = local;
    this.onChange(local ? `${UZ_PHONE_PREFIX} ${local}` : '');
  }
}
