# Push notifications (FCM) — configuración

## Claves VAPID (obligatorio, una vez por proyecto)

En Firebase Console de **cada** proyecto (`dualgi3de` y `solution-3d`):

1. **Project Settings** (engranaje) → pestaña **Cloud Messaging**
2. Sección **Web configuration** → **Web Push certificates**
3. Si no hay clave, clic en **Generate key pair** o **Import key**
4. Pegá la clave pública correspondiente:

| Proyecto | Clave pública VAPID |
|----------|---------------------|
| dualgi3de | `BJZsOEW6D3QI0uflC-mbD2HjlD2hhKdDHDNnbQkPJXyx0gEbUppeSSKtT67ijmzFMAs6laNC19uDXd5n7zCI_eE` |
| solution-3d | `BD5uadfHdJuGWxzpUAdolXOjuOVdPKHAwB6ejEiycrb9l1xCTUKk-58LOsBLmeEbLyQxVqS7WxtsOLZgHHsGWjU` |

Sin este paso, los tokens FCM no se generan y el push no llega con la app cerrada.

## Cómo funciona

1. El usuario inicia sesión → se registra su token FCM en `users/{uid}/fcm_tokens/`
2. Se crea un documento en `notifications/` (pedido nuevo, cambio de estado, etc.)
3. La Cloud Function `sendNotificationPush` envía el push al dispositivo
4. El Service Worker muestra la notificación con sonido aunque la app esté cerrada

## Requisitos en móvil

- **Android:** Aceptar permisos de notificaciones al iniciar sesión.
- **iPhone:** Instalar la app en la pantalla de inicio (PWA) y aceptar permisos (iOS 16.4+).

## Deploy

```bash
node scripts/deploy-all.mjs
```

Despliega hosting, reglas Firestore y la función `sendNotificationPush` en ambos proyectos.
