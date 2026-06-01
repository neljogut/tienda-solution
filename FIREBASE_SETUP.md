# Vinculacion Firebase

Este proyecto no incluye credenciales ni datos falsos. Para conectarlo al proyecto Firebase real:

1. Instalar o actualizar Firebase CLI y FlutterFire CLI.
2. Ejecutar:

```powershell
flutterfire configure
```

3. Seleccionar el proyecto Firebase existente de Dualgi 3D.
4. Confirmar que se genere `lib/firebase_options.dart`.
5. Revisar y publicar reglas:

```powershell
firebase deploy --only firestore:rules,storage
```

6. Para Cloud Functions:

```powershell
cd functions
npm install
npm run build
firebase deploy --only functions
```

## Roles iniciales

El owner se asigna manualmente creando o editando el documento:

```text
users/{uid}
```

Con datos minimos:

```json
{
  "role": "owner",
  "displayName": "Nombre del owner",
  "permissions": {}
}
```

Los clientes deben tener `role: "client"` y `customerId`. Los empleados deben tener `role: "employee"` y permisos booleanos por accion.

## Mercado Pago

La estructura de Cloud Functions ya deja el punto de entrada `createMercadoPagoPreference`, pero no se guarda ningun token en el repositorio. Configurar el secreto real en Firebase antes de habilitar pagos online.
