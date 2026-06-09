# Pagos — Dualgi 3D

> **Modo actual:** transferencia bancaria + WhatsApp (plan Firebase Spark, sin costo).
> Mercado Pago automático requiere plan Blaze o backend externo (ver sección al final).

# Configuración de transferencias (activo)

1. Ingresá como **owner** → **Negocio** → **Pagos y transferencias**.
2. Completá **Alias**, **CBU**, titular y banco.
3. Guardá la configuración.
4. Los clientes verán estos datos en el checkout con botón copiar.
5. Cuando llegue el comprobante por WhatsApp, registrá el pago en **Cuentas Corrientes**.

---

# Mercado Pago (opcional, requiere Blaze)

## 1. Credenciales en la app

1. Ingresá como **owner** → **Negocio** → sección **Pagos y transferencias**.
2. Completá **Public Key** y **Access Token** desde [Mercado Pago Developers](https://www.mercadopago.com.ar/developers).
3. Activá el toggle **Mercado Pago**.
4. Clic en **Guardar credenciales MP** (el token se guarda en `settings_private`, no visible en Firestore público).
5. Clic en **Probar conexión** para validar.

## 2. Webhook (actualización automática de pagos)

1. Copiá la **URL del Webhook** que aparece en Negocio.
2. En el panel de Mercado Pago → **Tus integraciones** → **Webhooks**.
3. Agregá la URL y seleccioná el tópico **`payment`**.
4. Guardá.

URL de producción:
```
https://us-central1-dualgi3de.cloudfunctions.net/mercadoPagoWebhook
```

## 3. Desplegar Cloud Functions

```powershell
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

## 4. Transferencia bancaria

En **Negocio** completá Alias, CBU, titular y banco. El cliente los ve en checkout con botón copiar.

Los pagos por transferencia **no** se confirman solos: el cliente debe enviar el comprobante por WhatsApp.

## 5. Flujos

| Flujo | Ruta | Comportamiento |
|-------|------|----------------|
| Compra catálogo | `/checkout` | Seña/total → MP o transferencia |
| Pago deuda | `/checkout?mode=balance` | FIFO del más viejo al más nuevo |
| Retorno MP | `/payment/result` | Muestra estado + WhatsApp |

## 6. Variables opcionales (Functions)

- `MERCADO_PAGO_ACCESS_TOKEN` — alternativa al guardado en Firestore
- `HOSTING_URL` — default `https://dualgi3de.web.app`
