import { AbstractControl, ValidationErrors } from '@angular/forms';

// Номер Узбекистана: 998 + 9 цифр (или просто 9 цифр без кода страны)
export function uzPhoneValidator(control: AbstractControl): ValidationErrors | null {
  const digits = String(control.value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const valid = (digits.length === 12 && digits.startsWith('998')) || digits.length === 9;
  return valid ? null : { phone: true };
}
