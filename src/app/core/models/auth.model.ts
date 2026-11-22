// Роли: владелец клиники, администратор регистратуры, врач
export type UserRole = 'owner' | 'admin' | 'doctor';

export interface User {
  id: number;
  fullName: string;
  username: string;
  role: UserRole;
  doctorId?: number;           // для роли «Врач» — его id в расписании
  doctorName?: string;         // для роли «Врач» — 'Сидоров А. П.'
  active?: boolean;            // false — вход запрещён
  clinicId?: number;           // клиника пользователя (из токена)
  clinicName?: string;
}

export interface LoginRequest {
  username: string;            // '<код_клиники>_<логин>', например smile_ivanov
  password: string;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: User;
}

export interface TokenPair {
  token: string;
  refreshToken: string;
}
