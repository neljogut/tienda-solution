import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Order } from '../types/order';

// Create styles
const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 10, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, borderBottom: '1 solid #EEE', paddingBottom: 10 },
  headerLeft: { flexDirection: 'column' },
  headerRight: { flexDirection: 'column', alignItems: 'flex-end' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1E293B', marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#64748B' },
  section: { marginBottom: 15 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', backgroundColor: '#F1F5F9', padding: 5, marginBottom: 8 },
  row: { flexDirection: 'row', borderBottom: '1 solid #F1F5F9', paddingVertical: 5 },
  rowHeader: { flexDirection: 'row', borderBottom: '2 solid #E2E8F0', paddingVertical: 5, fontWeight: 'bold', backgroundColor: '#F8FAFC' },
  col1: { width: '40%' },
  col2: { width: '15%', textAlign: 'center' },
  col3: { width: '20%', textAlign: 'right' },
  col4: { width: '25%', textAlign: 'right' },
  totalBox: { marginTop: 10, borderTop: '2 solid #E2E8F0', paddingTop: 10, flexDirection: 'column', alignItems: 'flex-end' },
  totalRow: { flexDirection: 'row', width: '40%', justifyContent: 'space-between', marginBottom: 4 },
  totalRowBold: { flexDirection: 'row', width: '40%', justifyContent: 'space-between', marginBottom: 4, fontWeight: 'bold', fontSize: 12 },
  footer: { position: 'absolute', bottom: 30, left: 30, right: 30, textAlign: 'center', color: '#94A3B8', fontSize: 8, borderTop: '1 solid #E2E8F0', paddingTop: 10 }
});

export const ClientOrderPDF = ({ order, businessName = "Dualgi 3D" }: { order: Order, businessName?: string }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>{businessName}</Text>
          <Text style={styles.subtitle}>Comprobante de Pedido</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={{ fontSize: 14, fontWeight: 'bold' }}>Nº {String(order.orderNumber).padStart(5, '0')}</Text>
          <Text style={{ color: '#64748B' }}>Fecha: {new Date(order.date).toLocaleDateString('es-AR')}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Datos del Cliente</Text>
        <Text>Nombre: {order.customerName}</Text>
        <Text>Estado del Pedido: {order.orderStatus.toUpperCase()}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Detalle de Productos</Text>
        <View style={styles.rowHeader}>
          <Text style={styles.col1}>Producto</Text>
          <Text style={styles.col2}>Cant.</Text>
          <Text style={styles.col3}>P. Unitario</Text>
          <Text style={styles.col4}>Subtotal</Text>
        </View>
        
        {order.items.map((item, i) => (
          <View style={styles.row} key={i}>
            <Text style={styles.col1}>{item.name}</Text>
            <Text style={styles.col2}>{item.quantity}</Text>
            <Text style={styles.col3}>${item.unitPrice.toLocaleString('es-AR')}</Text>
            <Text style={styles.col4}>${(item.unitPrice * item.quantity).toLocaleString('es-AR')}</Text>
          </View>
        ))}
      </View>

      <View style={styles.totalBox}>
        <View style={styles.totalRow}>
          <Text>Total del Pedido:</Text>
          <Text>${order.totalAmount.toLocaleString('es-AR')}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text>Monto Abonado:</Text>
          <Text>${order.paidAmount.toLocaleString('es-AR')}</Text>
        </View>
        <View style={styles.totalRowBold}>
          <Text>Saldo Pendiente:</Text>
          <Text>${order.pendingAmount.toLocaleString('es-AR')}</Text>
        </View>
      </View>

      {order.observationsPublic && (
        <View style={{ marginTop: 20 }}>
          <Text style={{ fontWeight: 'bold' }}>Observaciones:</Text>
          <Text style={{ color: '#475569', marginTop: 5 }}>{order.observationsPublic}</Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text>¡Gracias por confiar en {businessName}!</Text>
        <Text>Este documento no tiene validez como factura fiscal.</Text>
      </View>
    </Page>
  </Document>
);

export const InternalOrderPDF = ({ order, businessName = "Dualgi 3D" }: { order: Order, businessName?: string }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={{...styles.title, color: '#B91C1C'}}>BALANCE INTERNO</Text>
          <Text style={styles.subtitle}>{businessName} - Uso Exclusivo Administración</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={{ fontSize: 14, fontWeight: 'bold' }}>Nº {String(order.orderNumber).padStart(5, '0')}</Text>
          <Text style={{ color: '#64748B' }}>Fecha Venta: {new Date(order.date).toLocaleDateString('es-AR')}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Datos Generales</Text>
        <Text>Cliente: {order.customerName}</Text>
        <Text>Cotización USD usada: ${order.exchangeRateUsdUsed}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Desglose Financiero de Productos</Text>
        <View style={styles.rowHeader}>
          <Text style={{ width: '40%' }}>Producto</Text>
          <Text style={{ width: '10%' }}>Cant</Text>
          <Text style={{ width: '15%' }}>P. Venta</Text>
          <Text style={{ width: '15%' }}>Costo Real</Text>
          <Text style={{ width: '20%', textAlign: 'right' }}>Ganancia Neta</Text>
        </View>
        
        {order.items.map((item, i) => (
          <View style={styles.row} key={i}>
            <Text style={{ width: '40%' }}>
              {item.name} {item.isManualPrice ? '(Manual)' : ''}
            </Text>
            <Text style={{ width: '10%' }}>{item.quantity}</Text>
            <Text style={{ width: '15%' }}>${item.unitPrice.toLocaleString('es-AR')}</Text>
            <Text style={{ width: '15%', color: '#DC2626' }}>${item.unitCost.toLocaleString('es-AR')}</Text>
            <Text style={{ width: '20%', textAlign: 'right', color: '#16A34A', fontWeight: 'bold' }}>
              ${((item.unitPrice - item.unitCost) * item.quantity).toLocaleString('es-AR')}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.totalBox}>
        <View style={styles.totalRow}>
          <Text>Total Ingresos:</Text>
          <Text>${order.totalAmount.toLocaleString('es-AR')}</Text>
        </View>
        <View style={{...styles.totalRow, color: '#DC2626'}}>
          <Text>Costos Totales:</Text>
          <Text>-${order.totalCost.toLocaleString('es-AR')}</Text>
        </View>
        <View style={{...styles.totalRowBold, color: '#16A34A', borderTop: '1 solid #E2E8F0', paddingTop: 5}}>
          <Text>GANANCIA REAL:</Text>
          <Text>${order.totalProfit.toLocaleString('es-AR')}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text>Documento de control interno confidencial. No compartir con clientes.</Text>
      </View>
    </Page>
  </Document>
);
