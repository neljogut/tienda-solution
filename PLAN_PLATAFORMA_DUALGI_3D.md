# Plan: Plataforma Dualgi 3D

## Resumen

Construir una plataforma Flutter Web + Firebase para catalogo, ventas, pedidos, clientes, inventario, cuenta corriente, caja, balance, roles, permisos, imagenes y PDFs, sin datos de muestra.

La app inicia en catalogo publico. Invitados ven productos; clientes registrados pueden comprar/pedir; owner y empleados entran al panel segun rol/permisos.

## Arquitectura

- Frontend: Flutter Web.
- Backend: Firebase Auth, Firestore, Storage y Cloud Functions.
- Owner asignado manualmente en Firestore.
- Cloud Functions para operaciones criticas: creacion de pedidos, congelamiento de precios, pagos, stock, caja, PDFs internos, balance y webhooks de Mercado Pago.
- Build final: Flutter Web estatico para subir a cualquier hosting.
- Colecciones: `users`, `customers`, `products`, `filaments`, `supplies`, `orders`, `payments`, `cash_sessions`, `cash_movements`, `inventory_movements`, `business_settings`, `pricing_settings`, `exchange_rates`, `pdf_documents`.

## Calculo Automatico de Precios

### Configuracion impresion 3D

Parametros editables por owner:

- Precio filamento por KG en USD.
- Cotizacion dolar actual.
- Precio KWh.
- Consumo impresora en watts.
- Vida util de maquina en horas.
- Costo estimado en repuestos.
- Margen de error %.
- Multiplicador minorista no llavero.
- Multiplicador minorista llavero.
- Descuento mayorista % no llavero.
- Descuento mayorista % llavero.
- Umbral en gramos para mayorista no llavero.
- Umbral en gramos para mayorista llavero.

Formulas:

- `costoFilamento = (gramosProducto / 1000) * precioFilamentoUsdKg * cotizacionDolar`
- `horasImpresion = minutosImpresion / 60`
- `costoElectricidad = (consumoWatts / 1000) * horasImpresion * precioKwh`
- `costoMantenimiento = (costoRepuestos / vidaUtilHoras) * horasImpresion`
- `costoInsumos = sum(cantidadInsumo * costoUnitarioInsumo)`
- `costoBase = costoFilamento + costoElectricidad + costoMantenimiento + costoInsumos`
- `margenError = costoBase * margenErrorPorcentaje / 100`
- `costoReal = costoBase + margenError`
- Si es llavero: `precioMinoristaAuto = costoReal * multiplicadorMinoristaLlavero`
- Si no es llavero: `precioMinoristaAuto = costoReal * multiplicadorMinoristaNoLlavero`
- Si supera el umbral mayorista correspondiente: `precioMayorista = precioMinorista * (1 - descuentoMayorista / 100)`
- Si no supera el umbral: no se muestra precio mayorista disponible.
- `gananciaEstimada = precioVenta - costoReal`

Si el producto usa precio manual:

- `precioMinorista = precioManualMinorista`
- El sistema sigue calculando `costoReal`.
- El mayorista se calcula desde el precio manual: `precioMayorista = precioManualMinorista * (1 - descuentoMayorista / 100)`
- El pedido debe guardar que fue vendido con precio manual.

### Configuracion reventa

Parametros editables por owner:

- Ganancia sobre costo de compra %.
- Activar/desactivar mayorista.
- Descuento mayorista %.
- Pedido minimo en pesos para aplicar mayorista.

Formulas:

- `precioMinoristaAuto = costoCompra * (1 + gananciaPorcentaje / 100)`
- Si precio manual esta activo: `precioMinorista = precioManualMinorista`
- Si precio manual esta inactivo: `precioMinorista = precioMinoristaAuto`
- Si mayorista reventa esta activo y el pedido alcanza el minimo: `precioMayorista = precioMinorista * (1 - descuentoMayorista / 100)`
- Si mayorista esta desactivado: no se calcula ni muestra precio mayorista.
- `gananciaPorUnidad = precioVenta - costoCompra`

Todos los precios visibles se muestran en pesos argentinos. Los calculos se redondean a pesos enteros al guardar o mostrar importes finales.

## Cotizacion del Dolar

- Obtener cotizacion automaticamente desde API basada en Banco Nacion o fuente argentina equivalente.
- Guardar ultima cotizacion, fecha/hora y proveedor.
- Si falla la API, usar ultima cotizacion guardada.
- Si nunca hubo cotizacion, owner puede cargar valor manual de emergencia.
- Los precios del catalogo se actualizan con la cotizacion vigente.
- Los pedidos ya creados nunca se recalculan automaticamente.

## Pedidos y Precios Congelados

- Cliente puede crear pedido desde catalogo.
- Owner o empleado con permiso puede crear pedido para cliente existente o crear cliente manual durante el flujo.
- Al confirmar pedido, guardar snapshot congelado:
  - precio unitario vendido,
  - minorista/mayorista aplicado,
  - precio automatico o manual,
  - cotizacion usada,
  - fecha/hora de cotizacion,
  - costos internos calculados,
  - ganancia estimada,
  - imagen/referencia del producto.
- Cuenta corriente, pagos, PDFs y balance siempre usan el snapshot del pedido, no el precio actual del catalogo.

## Pagos, Senas y Caja

- Metodos: efectivo, transferencia, Mercado Pago, tarjeta, otro.
- Mercado Pago disponible para sena online, pero no obligatorio.
- En compras de local puede pagarse en efectivo.
- Regla general: sena minima 50% del total.
- Si el cliente esta marcado como cliente de confianza, puede pagar cualquier sena, incluso $0.
- Pedidos con saldo pendiente impactan en cuenta corriente.
- Todo pago registrado actualiza pedido, cuenta corriente y caja si hay caja abierta.
- Si se registra efectivo sin caja abierta, mostrar advertencia antes de confirmar.
- Caja mide dinero del turno; balance mide rentabilidad.

## Modulos Principales

- Dashboard owner con ventas, pedidos, deuda, inventario bajo, caja, dolar y accesos rapidos.
- Catalogo publico e interno.
- Productos 3D y reventa.
- Imagenes en productos, filamentos e insumos.
- Clientes y clientes de confianza.
- Pedidos.
- Cuenta corriente con aplicacion automatica del pago desde deuda mas antigua.
- Inventario de filamentos, insumos, productos 3D y reventa.
- Movimientos de inventario automaticos.
- Caja por turno e historial.
- Balance financiero por periodo.
- Configuracion de precios.
- Configuracion del negocio.
- Empleados, roles y permisos.
- PDFs cliente, internos y balance.

## Seguridad

- Clientes solo ven sus datos, pedidos, pagos, cuenta corriente y PDFs publicos.
- Clientes nunca ven costos, ganancias, balance, inventario interno, PDFs internos ni precio manual.
- Empleados solo ven modulos habilitados.
- Las URLs directas tambien validan permisos.
- Owner tiene acceso total.

## PDFs

- PDF cliente:
  - logo, negocio, pedido, cliente, productos, cantidades, precios, total, abonado, saldo y estado.
  - No muestra costos ni ganancias.
- PDF interno:
  - costos, ganancia, cotizacion, precio manual/automatico, insumos, filamento, electricidad, mantenimiento y rentabilidad.
- PDF balance:
  - respeta filtro activo: dia, semana, mes, ano, todo o rango personalizado.

## Test Plan

- Tests de calculo:
  - impresion 3D no llavero,
  - impresion 3D llavero,
  - precio manual,
  - mayorista por umbral,
  - reventa automatica,
  - reventa manual,
  - mayorista reventa activo/inactivo,
  - cotizacion fallback.
- Tests de negocio:
  - congelamiento de precio al crear pedido.
  - cambio de dolar no modifica pedidos viejos.
  - pago parcial actualiza estado a senado.
  - pago total actualiza estado a pagado.
  - cuenta corriente aplica pago desde pedido mas antiguo.
  - cliente de confianza puede crear pedido con sena menor al 50%.
- Tests de seguridad:
  - cliente no accede a pedidos ajenos.
  - cliente no accede a PDFs internos.
  - empleado sin permiso no crea pedidos ni ve modulos bloqueados.
- Verificacion:
  - `flutter analyze`.
  - `flutter test`.
  - build web estatico.
  - revision responsive desktop/mobile.
