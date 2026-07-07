import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type { Quote } from '../../types/quote';
import type { BusinessSettings } from '../../types/settings';

// Define styles for PDF
const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', color: '#1e293b' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 40, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 20 },
  logoText: { fontSize: 24, fontWeight: 'bold', color: '#4f46e5' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 10 },
  metaData: { fontSize: 10, color: '#64748b', marginBottom: 4 },
  customerSection: { marginBottom: 30, padding: 15, backgroundColor: '#f8fafc', borderRadius: 4 },
  customerName: { fontSize: 14, fontWeight: 'bold', marginBottom: 5 },
  table: { width: '100%', marginBottom: 30 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderBottomWidth: 1, borderBottomColor: '#cbd5e1', padding: 8 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', padding: 8 },
  colItem: { flex: 3, fontSize: 10 },
  colQty: { flex: 1, fontSize: 10, textAlign: 'center' },
  colPrice: { flex: 1.5, fontSize: 10, textAlign: 'right' },
  colSub: { flex: 1.5, fontSize: 10, textAlign: 'right', fontWeight: 'bold' },
  headerText: { fontSize: 10, fontWeight: 'bold', color: '#475569' },
  summary: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 20 },
  summaryBox: { width: 200, padding: 10, backgroundColor: '#f8fafc', borderLeftWidth: 4, borderLeftColor: '#4f46e5' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  totalLabel: { fontSize: 14, fontWeight: 'bold' },
  totalValue: { fontSize: 16, fontWeight: 'bold', color: '#4f46e5' },
  footer: { position: 'absolute', bottom: 40, left: 40, right: 40, textAlign: 'center', color: '#94a3b8', fontSize: 9, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 10 },
});

interface QuotePDFProps {
  quote: Quote;
  settings?: BusinessSettings | null;
}

export const QuotePDF: React.FC<QuotePDFProps> = ({ quote, settings }) => {
  const businessName = settings?.name || 'SOLUTION';
  const logoUrl = settings?.logoUrl;
  const address = settings?.address || '';
  const phone = settings?.phone || '';
  const instagram = settings?.instagram || '';
  const email = settings?.email || '';
  const cuit = settings?.cuit || '';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* Header */}
        <View style={styles.header}>
          <View>
            {logoUrl ? (
              <Image src={logoUrl} style={{ width: 120, height: 40, objectFit: 'contain', marginBottom: 10 }} />
            ) : (
              <Text style={styles.logoText}>{businessName}</Text>
            )}
            {address ? <Text style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>{address}</Text> : null}
            {phone ? <Text style={{ fontSize: 10, color: '#64748b' }}>{phone}</Text> : null}
            {instagram ? <Text style={{ fontSize: 10, color: '#64748b' }}>{instagram}</Text> : null}
            {email ? <Text style={{ fontSize: 10, color: '#64748b' }}>{email}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.title}>PRESUPUESTO</Text>
            <Text style={styles.metaData}>Fecha: {new Date(quote.createdAt).toLocaleDateString()}</Text>
            <Text style={styles.metaData}>Vencimiento: {new Date(quote.validUntil).toLocaleDateString()}</Text>
          </View>
        </View>

        {/* Customer info */}
        <View style={styles.customerSection}>
          <Text style={styles.metaData}>Preparado para:</Text>
          <Text style={styles.customerName}>{quote.customerName || 'Cliente'}</Text>
        </View>

        {/* Items Table */}
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <View style={styles.colItem}><Text style={styles.headerText}>ARTÍCULO</Text></View>
            <View style={styles.colQty}><Text style={styles.headerText}>CANT.</Text></View>
            <View style={styles.colPrice}><Text style={styles.headerText}>PRECIO UNIT.</Text></View>
            <View style={styles.colSub}><Text style={styles.headerText}>SUBTOTAL</Text></View>
          </View>

          {/* Table Rows */}
          {quote.items.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <View style={styles.colItem}>
                <Text style={{ fontWeight: item.isManual ? 'normal' : 'bold' }}>{item.name}</Text>
              </View>
              <View style={styles.colQty}><Text>{item.quantity}</Text></View>
              <View style={styles.colPrice}><Text>${item.unitPrice.toLocaleString()}</Text></View>
              <View style={styles.colSub}><Text>${item.subtotal.toLocaleString()}</Text></View>
            </View>
          ))}
        </View>

        {/* Summary */}
        <View style={styles.summary}>
          <View style={styles.summaryBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL:</Text>
              <Text style={styles.totalValue}>${quote.total.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={{ marginBottom: 4 }}>
            * Los precios cotizados en este documento son válidos por 7 días a partir de la fecha de emisión.
          </Text>
          <Text>
            {businessName}{cuit ? ` / Cuit: ${cuit}` : ''}
          </Text>
        </View>

      </Page>
    </Document>
  );
};
