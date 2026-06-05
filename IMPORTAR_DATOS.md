# Importar datos desde `importar/`

Los JSON en la carpeta `importar/` son un export de tu otra plataforma de gestión (mismo negocio DuAlGi 3D). El script los adapta al esquema de esta aplicación.

## Qué se importa

| Origen | Destino en Firestore |
|--------|----------------------|
| `meta/categorias_producto` | `categories` |
| `insumos/` (filamentos e insumos) | `inventory` |
| `productos/` | `products` |
| `clientes/` | `clients` |
| `pedidos/` | `orders` (con `orderNumber` por fecha) |
| `configuracion_calculadora` + `_perfil` | `settings/pricing3d`, `pricingResale`, `business` |
| `cash_sessions/` | `cash_sessions` (histórico) |
| `inventario_movimientos/` | `inventory_movements` (~174 transacciones agrupadas) |

## Qué no se importa

- **Mercado Pago** (`integraciones/mercadopago.json`): contiene un token; configurarlo de nuevo en la app.
- **Empleados** (`staff_members`): requieren usuarios en Firebase Auth.

> Los movimientos históricos se importan como auditoría. El stock actual sigue viniendo de productos/insumos, no se recalcula desde el historial.

## Requisitos

1. Node.js 18+
2. Sesión activa de Firebase CLI (`firebase login`) **o** cuenta de servicio en `GOOGLE_APPLICATION_CREDENTIALS`

> Si usás solo Firebase CLI, el script necesita reglas temporales abiertas durante la importación (el script no las cambia solo; hacelo manualmente o pedí ayuda).

## Pasos

### 1. Vista previa (no escribe en la base)

```powershell
cd "c:\Proyectos\Dualgi 3D"
npm install
node scripts/import-gestion-data.mjs --dry-run
```

### 2. Importación completa

```powershell
npm run import:data:execute
```

### 3. Importación parcial (opcional)

```powershell
node scripts/import-gestion-data.mjs --execute --only=categories,inventory,products
```

## Después de importar

1. Entrá al admin y revisá **Productos**, **Clientes**, **Pedidos** e **Inventario**.
2. En **Configuración de precios**, ajustá el precio del filamento en USD/kg si hace falta (el export anterior usaba pesos/kg).
3. Configurá Mercado Pago y empleados manualmente si los necesitás.

## Seguridad

- No subas `importar/integraciones/` ni archivos `*adminsdk*.json` a git.
- Si el token de MP del export se filtró, rotalo en [Mercado Pago Developers](https://www.mercadopago.com.ar/developers).
