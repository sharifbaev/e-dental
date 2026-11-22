// Настройки для production-сборки
export const environment = {
  production: true,
  // Бэкенд — на том же домене, что и фронт, по пути /api (обратный прокси на сервере).
  // Локально (ng serve) /api уходит на http://localhost:8080 — см. proxy.conf.json
  apiUrl: '/api'
};
