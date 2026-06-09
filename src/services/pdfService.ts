import { jsPDF } from 'jspdf';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Order } from '../types/order';
import type { BusinessSettings } from '../types/settings';

// Utility to format dates
const formatDate = (isoString?: string) => {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatDateOnly = (isoString?: string) => {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

// Utility to format numbers as ARS currency
const formatCurrency = (amount: number) => {
  return `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

// Mapped display code: PED-ddMMyyyy-xxxx
const getOrderDisplayCode = (order: Order) => {
  if (!order.id || !order.date) {
    return `PED-00000000-${order.orderNumber}`;
  }
  const dateObj = new Date(order.date);
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const yyyy = dateObj.getFullYear();
  const rawId = order.id.replace(/-/g, '').toLowerCase();
  const suffix = rawId.length >= 4 ? rawId.substring(rawId.length - 4) : rawId;
  return `PED-${dd}${mm}${yyyy}-${suffix}`;
};

export const generateClientPDF = async (
  order: Order,
  business: BusinessSettings,
  asBlob = false
): Promise<Blob | void> => {
  const docPdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Fetch client details from firestore
  let clientEmail = '';
  let clientPhone = '';
  let clientAddress = '';
  let clientName = order.customerName;

  try {
    const clientSnap = await getDoc(doc(db, 'clients', order.customerId));
    if (clientSnap.exists()) {
      const cData = clientSnap.data();
      clientEmail = cData.email || '';
      clientPhone = cData.phone || '';
      clientAddress = cData.address || '';
      if (cData.firstName || cData.lastName) {
        clientName = `${cData.firstName || ''} ${cData.lastName || ''}`.trim();
      }
    }
  } catch (err) {
    console.error('Error fetching client details:', err);
  }

  const greyDark = '#1e293b';
  const greyLight = '#64748b';
  const borderGrey = '#94a3b8';

  // 1. Header (Logo on left, Business Details on right)
  let y = 15;
  if (business.logoUrl) {
    try {
      docPdf.addImage(business.logoUrl, 'PNG', 15, y, 25, 25);
    } catch (_) {
      // Fallback if image fails to load
      docPdf.rect(15, y, 25, 25, 'S');
    }
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(22);
    docPdf.setTextColor(greyDark);
    docPdf.text(business.name, 45, y + 6);

    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(10);
    docPdf.setTextColor(greyLight);
    docPdf.text(business.ownerName, 45, y + 12);
    docPdf.text(`${business.address}, ${business.city}, ${business.province}`, 45, y + 17);
    docPdf.text(business.description || 'Sistema de gestión de pedidos', 45, y + 22);
  } else {
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(24);
    docPdf.setTextColor(greyDark);
    docPdf.text(business.name, 15, y + 8);

    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(10);
    docPdf.setTextColor(greyLight);
    docPdf.text(business.ownerName, 15, y + 15);
    docPdf.text(`${business.address}, ${business.city}, ${business.province}`, 15, y + 20);
    docPdf.text(business.description || 'Sistema de gestión de pedidos', 15, y + 25);
  }

  // 2. Title & Metadata
  y = 48;
  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(16);
  docPdf.setTextColor(greyDark);
  docPdf.text('FACTURA / PEDIDO', 15, y);

  y += 8;
  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(10);
  docPdf.text(`Número: ${getOrderDisplayCode(order)}`, 15, y);
  y += 5;
  docPdf.text(`Fecha: ${formatDateOnly(order.date)}`, 15, y);

  // 3. Customer Data
  y += 10;
  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(12);
  docPdf.text('DATOS DEL CLIENTE', 15, y);

  y += 6;
  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(10);
  docPdf.text(`Nombre: ${clientName}`, 15, y);
  y += 5;
  docPdf.text(`Email: ${clientEmail}`, 15, y);
  if (clientPhone) {
    y += 5;
    docPdf.text(`Teléfono: ${clientPhone}`, 15, y);
  }
  if (clientAddress) {
    y += 5;
    docPdf.text(`Dirección: ${clientAddress}`, 15, y);
  }

  // 4. Products Table
  y += 12;
  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(12);
  docPdf.text('DETALLE DE PRODUCTOS', 15, y);

  y += 6;
  // Draw header row
  docPdf.setFillColor(229, 231, 235); // grey-200
  docPdf.rect(15, y, 180, 8, 'F');
  docPdf.setDrawColor(borderGrey);
  docPdf.rect(15, y, 180, 8, 'S');

  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(9);
  docPdf.setTextColor(greyDark);
  docPdf.text('Producto', 17, y + 5.5);
  docPdf.text('Cant.', 122, y + 5.5, { align: 'center' });
  docPdf.text('P. unit.', 155, y + 5.5, { align: 'right' });
  docPdf.text('Subtotal', 193, y + 5.5, { align: 'right' });

  // Grid vertical separator lines for header
  docPdf.line(110, y, 110, y + 8);
  docPdf.line(135, y, 135, y + 8);
  docPdf.line(165, y, 165, y + 8);

  y += 8;
  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(9);

  order.items.forEach((item) => {
    // Check height
    const truncatedName = item.name.length > 42 ? `${item.name.substring(0, 40)}...` : item.name;
    const splitName = docPdf.splitTextToSize(truncatedName, 90);
    const rowHeight = Math.max(splitName.length * 4.5 + 4, 10);

    // Draw row cell boundaries
    docPdf.rect(15, y, 180, rowHeight, 'S');
    docPdf.line(110, y, 110, y + rowHeight);
    docPdf.line(135, y, 135, y + rowHeight);
    docPdf.line(165, y, 165, y + rowHeight);

    // Text cells
    docPdf.text(splitName, 17, y + 5);
    const code = `PROD-${item.productId.slice(0, 8).toUpperCase()}`;
    docPdf.setFontSize(8);
    docPdf.setTextColor(greyLight);
    docPdf.text(`Cód.: ${code}`, 17, y + rowHeight - 2);
    docPdf.setFontSize(9);
    docPdf.setTextColor(greyDark);

    docPdf.text(item.quantity.toString(), 122, y + 5, { align: 'center' });
    docPdf.text(formatCurrency(item.unitPrice), 155, y + 5, { align: 'right' });
    docPdf.text(formatCurrency(item.unitPrice * item.quantity), 193, y + 5, { align: 'right' });

    y += rowHeight;
  });

  // 5. Summary block
  y += 10;
  docPdf.line(15, y, 195, y);

  y += 8;
  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(14);
  docPdf.text('TOTAL A PAGAR', 15, y);
  docPdf.text(formatCurrency(order.totalAmount), 193, y, { align: 'right' });

  y += 8;
  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(10);
  const displayStatus = order.paymentStatus === 'paid' ? 'Pagado' : (order.paymentStatus === 'partial' ? 'Parcial' : 'Impago');
  docPdf.text(`Estado de pago: ${displayStatus}`, 15, y);
  
  const paymentMethodLabel = order.paymentMethod === 'cash' ? 'Efectivo' : 
                             (order.paymentMethod === 'transfer' ? 'Transferencia' : 
                             (order.paymentMethod === 'mercadopago' ? 'Mercado Pago' : 
                             (order.paymentMethod === 'card' ? 'Tarjeta' : 'Otro')));
  docPdf.text(`Medio: ${paymentMethodLabel}`, 110, y);

  y += 6;
  docPdf.text(`Pagado: ${formatCurrency(order.paidAmount)}`, 15, y);
  docPdf.setTextColor(order.pendingAmount > 0 ? '#b91c1c' : '#15803d');
  docPdf.text(`Pendiente: ${formatCurrency(order.pendingAmount)}`, 110, y);
  docPdf.setTextColor(greyDark);

  if (order.observationsPublic) {
    y += 10;
    docPdf.setFont('helvetica', 'bold');
    docPdf.text('NOTAS', 15, y);
    y += 5;
    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(9);
    const splitNotes = docPdf.splitTextToSize(order.observationsPublic, 175);
    docPdf.text(splitNotes, 15, y);
  }

  // Centered footer
  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(8);
  docPdf.setTextColor(greyLight);
  docPdf.text(`Gracias por tu compra - ${business.name}`, 105, 285, { align: 'center' });

  const filename = `Factura_${getOrderDisplayCode(order)}.pdf`;
  if (asBlob) {
    return docPdf.output('blob') as Blob;
  }
  docPdf.save(filename);
};

export const getClientPDFBlob = (order: Order, business: BusinessSettings) =>
  generateClientPDF(order, business, true) as Promise<Blob>;

export const generateInternalPDF = async (order: Order, business: BusinessSettings) => {
  const docPdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const greyDark = '#1e293b';
  const greyLight = '#64748b';
  const borderGrey = '#cbd5e1';

  // Load calculator and products dynamically to display exact margins
  let pricing3d: any = null;
  const productsDataMap = new Map<string, any>();
  const suppliesMap = new Map<string, any>();
  let clientName = order.customerName;

  try {
    const pricingSnap = await getDoc(doc(db, 'settings', 'pricing3d'));
    if (pricingSnap.exists()) pricing3d = pricingSnap.data();

    // Fetch client details
    const clientSnap = await getDoc(doc(db, 'clients', order.customerId));
    if (clientSnap.exists()) {
      const cData = clientSnap.data();
      if (cData.firstName || cData.lastName) {
        clientName = `${cData.firstName || ''} ${cData.lastName || ''}`.trim();
      }
    }

    // Fetch products
    await Promise.all(order.items.map(async (item) => {
      const prodSnap = await getDoc(doc(db, 'products', item.productId));
      if (prodSnap.exists()) {
        const prodVal = prodSnap.data();
        productsDataMap.set(item.productId, prodVal);

        // Fetch custom supply details
        const sLines = prodVal.supplyIds || [];
        const fLines = prodVal.filamentLines || [];
        await Promise.all([
          ...sLines.map(async (sl: any) => {
            if (!suppliesMap.has(sl.supplyId)) {
              const snap = await getDoc(doc(db, 'inventory', sl.supplyId));
              if (snap.exists()) suppliesMap.set(sl.supplyId, snap.data());
            }
          }),
          ...fLines.map(async (fl: any) => {
            if (!suppliesMap.has(fl.supplyId)) {
              const snap = await getDoc(doc(db, 'inventory', fl.supplyId));
              if (snap.exists()) suppliesMap.set(fl.supplyId, snap.data());
            }
          })
        ]);
      }
    }));
  } catch (err) {
    console.error('Error fetching internal metrics:', err);
  }

  // Math variables
  let totalCalculatedCost = 0;
  const filamentRows: any[] = [];
  const insumoRows: any[] = [];
  const resaleRows: any[] = [];

  let totalCostoFilamento = 0;
  let totalCostoInsumo = 0;
  let totalCostoDesgaste = 0;
  let totalCostoLuz = 0;
  let totalCostoMargenError = 0;

  const rate = order.exchangeRateUsdUsed || 1000;
  const globalFilPriceUsd = pricing3d?.filamentPriceUsdKg || 20;

  order.items.forEach((item) => {
    const originalProd = productsDataMap.get(item.productId);
    const itemCostTotal = item.unitCost * item.quantity;
    totalCalculatedCost += itemCostTotal;

    if (item.type === '3d' && originalProd) {
      // 3D Printing breakdown
      const fLines = originalProd.filamentLines || [];
      if (fLines.length > 0) {
        fLines.forEach((fl: any) => {
          const inv = suppliesMap.get(fl.supplyId);
          const priceKgUsd = inv?.priceUsdKg || globalFilPriceUsd;
          const cost = (fl.grams / 1000) * (priceKgUsd * rate) * item.quantity;
          totalCostoFilamento += cost;
          filamentRows.push({
            productName: item.name,
            quantity: item.quantity,
            filDescription: inv?.brand || 'PLA',
            filBrand: inv?.brand || 'PLA',
            grams: fl.grams * item.quantity,
            precioKg: priceKgUsd * rate,
            costo: cost
          });
        });
      } else {
        // Fallback default filament calculations if lines are not found
        const grams = originalProd.weightGrams || 0;
        const cost = (grams / 1000) * (globalFilPriceUsd * rate) * item.quantity;
        totalCostoFilamento += cost;
        filamentRows.push({
          productName: item.name,
          quantity: item.quantity,
          filDescription: 'PLA Genérico',
          filBrand: 'PLA',
          grams: grams * item.quantity,
          precioKg: globalFilPriceUsd * rate,
          costo: cost
        });
      }

      // Add insumos
      const sLines = originalProd.supplyIds || [];
      sLines.forEach((sl: any) => {
        const inv = suppliesMap.get(sl.supplyId);
        const uCost = inv?.unitCostArs || inv?.price || 0;
        const cost = uCost * sl.quantity * item.quantity;
        totalCostoInsumo += cost;
        insumoRows.push({
          productName: item.name,
          quantity: item.quantity,
          insumoName: inv?.name || 'Insumo',
          cantidad: sl.quantity * item.quantity,
          precioUnit: uCost,
          costo: cost
        });
      });

      // Machine and utilities parameters
      const hours = ((originalProd.printTimeMinutes || 0) / 60) * item.quantity;
      const consumptionKwh = hours * (pricing3d?.printerWatts || 300) / 1000;
      const light = consumptionKwh * (pricing3d?.kwhPriceArs || 150);
      const machineWear = hours * (pricing3d?.estimatedSparesCostArs || 60000) / (pricing3d?.printerLifespanHours || 8000);
      
      const subtotalCost3d = (totalCostoFilamento + totalCostoInsumo + light + machineWear);
      const errorMargin = subtotalCost3d * ((pricing3d?.errorMarginPercent || 10) / 100);

      totalCostoDesgaste += machineWear;
      totalCostoLuz += light;
      totalCostoMargenError += errorMargin;
    } else if (item.type === 'resale') {
      const originalProd = productsDataMap.get(item.productId);
      const uCost = originalProd?.purchaseCost || item.unitCost || 0;
      resaleRows.push({
        productName: item.name,
        productCode: `PROD-${item.productId.slice(0, 8).toUpperCase()}`,
        quantity: item.quantity,
        costoCompraUnit: uCost,
        costoTotal: uCost * item.quantity
      });
    }
  });

  const ganancia = order.totalProfit;

  // Header Layout
  let y = 15;
  if (business.logoUrl) {
    try {
      docPdf.addImage(business.logoUrl, 'PNG', 15, y, 18, 18);
    } catch (_) {
      docPdf.rect(15, y, 18, 18, 'S');
    }
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(18);
    docPdf.text(business.name, 38, y + 6);
    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(10);
    docPdf.setTextColor(greyLight);
    docPdf.text('Balance financiero', 38, y + 12);
  } else {
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(18);
    docPdf.text(business.name, 15, y + 6);
    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(10);
    docPdf.setTextColor(greyLight);
    docPdf.text('Balance financiero', 15, y + 12);
  }

  // Right Side Confidencial
  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(9);
  docPdf.setTextColor('#991b1b');
  docPdf.text('CONFIDENCIAL', 195, y + 5, { align: 'right' });
  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(8);
  docPdf.setTextColor(greyLight);
  docPdf.text('Solo uso interno', 195, y + 10, { align: 'right' });

  // Blue divider bar
  y += 20;
  docPdf.setDrawColor('#1e40af'); // blue800
  docPdf.setLineWidth(1);
  docPdf.line(15, y, 195, y);

  // Row Details
  y += 10;
  docPdf.setTextColor(greyDark);
  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(12);
  docPdf.text(`Pedido: ${getOrderDisplayCode(order)}`, 15, y);
  
  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(10);
  y += 5;
  docPdf.text(`Cliente: ${clientName}`, 15, y);
  y += 5;
  docPdf.text(`Fecha: ${formatDate(order.date)}`, 15, y);

  // GANANCIA card metrics
  const cardX = 145;
  const cardY = y - 10;
  docPdf.setFillColor(ganancia >= 0 ? '#f0fdf4' : '#fef2f2'); // green50 / red50
  docPdf.rect(cardX, cardY, 50, 16, 'F');
  docPdf.setDrawColor(ganancia >= 0 ? '#166534' : '#991b1b'); // green800 / red800
  docPdf.setLineWidth(0.4);
  docPdf.rect(cardX, cardY, 50, 16, 'S');

  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(8);
  docPdf.setTextColor('#1f2937');
  docPdf.text('GANANCIA', cardX + 25, cardY + 5, { align: 'center' });

  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(14);
  docPdf.setTextColor(ganancia >= 0 ? '#14532d' : '#7f1d1d'); // green900 / red900
  docPdf.text(formatCurrency(ganancia), cardX + 25, cardY + 12, { align: 'center' });

  docPdf.setTextColor(greyDark);
  docPdf.setFont('helvetica', 'normal');

  const sectionHeader = (title: string, yPos: number) => {
    docPdf.setFillColor('#1e293b'); // grey800
    docPdf.rect(15, yPos, 180, 6, 'F');
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(8.5);
    docPdf.setTextColor('#ffffff');
    docPdf.text(title, 17, yPos + 4.5);
    docPdf.setTextColor(greyDark);
  };

  // Sections
  // 1. INGRESOS
  y += 10;
  sectionHeader('INGRESOS', y);
  y += 6;
  docPdf.setFillColor('#eff6ff'); // blue50
  docPdf.rect(15, y, 180, 6, 'F');
  docPdf.setDrawColor(borderGrey);
  docPdf.rect(15, y, 180, 6, 'S');
  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(8);
  docPdf.text('Producto', 17, y + 4.5);
  docPdf.text('Cant.', 120, y + 4.5);
  docPdf.text('P. unit.', 155, y + 4.5, { align: 'right' });
  docPdf.text('Subtotal', 193, y + 4.5, { align: 'right' });

  docPdf.setFont('helvetica', 'normal');
  order.items.forEach((e) => {
    y += 6;
    docPdf.rect(15, y, 180, 6, 'S');
    docPdf.text(e.name.length > 40 ? `${e.name.substring(0, 38)}...` : e.name, 17, y + 4.5);
    docPdf.text(e.quantity.toString(), 120, y + 4.5);
    docPdf.text(formatCurrency(e.unitPrice), 155, y + 4.5, { align: 'right' });
    docPdf.text(formatCurrency(e.unitPrice * e.quantity), 193, y + 4.5, { align: 'right' });
  });

  y += 6;
  docPdf.setFillColor('#e2e8f0'); // grey200
  docPdf.rect(15, y, 180, 6, 'F');
  docPdf.rect(15, y, 180, 6, 'S');
  docPdf.setFont('helvetica', 'bold');
  docPdf.text('TOTAL INGRESOS', 17, y + 4.5);
  docPdf.setTextColor('#14532d'); // green900
  docPdf.text(`+ ${formatCurrency(order.totalAmount)}`, 193, y + 4.5, { align: 'right' });
  docPdf.setTextColor(greyDark);

  // 2. REVENTA Table
  if (resaleRows.length > 0) {
    y += 12;
    sectionHeader('COSTO DE PRODUCTOS DE REVENTA', y);
    y += 6;
    docPdf.setFillColor('#fef3c7'); // amber100
    docPdf.rect(15, y, 180, 6, 'F');
    docPdf.rect(15, y, 180, 6, 'S');
    docPdf.setFont('helvetica', 'bold');
    docPdf.text('Producto / código', 17, y + 4.5);
    docPdf.text('Cant.', 120, y + 4.5);
    docPdf.text('Compra /u', 155, y + 4.5, { align: 'right' });
    docPdf.text('Costo de productos', 193, y + 4.5, { align: 'right' });

    docPdf.setFont('helvetica', 'normal');
    let totalCostoReventa = 0;
    resaleRows.forEach((r) => {
      y += 6;
      docPdf.rect(15, y, 180, 6, 'S');
      docPdf.text(r.productName, 17, y + 4.5);
      docPdf.text(r.quantity.toString(), 120, y + 4.5);
      docPdf.text(formatCurrency(r.costoCompraUnit), 155, y + 4.5, { align: 'right' });
      docPdf.setTextColor('#991b1b');
      docPdf.text(`- ${formatCurrency(r.costoTotal)}`, 193, y + 4.5, { align: 'right' });
      docPdf.setTextColor(greyDark);
      totalCostoReventa += r.costoTotal;
    });

    y += 6;
    docPdf.setFillColor('#e2e8f0');
    docPdf.rect(15, y, 180, 6, 'F');
    docPdf.rect(15, y, 180, 6, 'S');
    docPdf.setFont('helvetica', 'bold');
    docPdf.text('TOTAL COSTO DE PRODUCTOS', 17, y + 4.5);
    docPdf.setTextColor('#7f1d1d');
    docPdf.text(`- ${formatCurrency(totalCostoReventa)}`, 193, y + 4.5, { align: 'right' });
    docPdf.setTextColor(greyDark);
  }

  // 3. COSTOS DE FILAMENTO (IMPRESIÓN 3D)
  y += 12;
  sectionHeader('COSTOS DE FILAMENTO (IMPRESIÓN 3D)', y);
  y += 6;
  docPdf.setFillColor('#ffedd5'); // orange100
  docPdf.rect(15, y, 180, 6, 'F');
  docPdf.rect(15, y, 180, 6, 'S');
  docPdf.setFont('helvetica', 'bold');
  docPdf.text('Producto', 17, y + 4.5);
  docPdf.text('Filamento', 75, y + 4.5);
  docPdf.text('g', 125, y + 4.5, { align: 'right' });
  docPdf.text('$/kg', 155, y + 4.5, { align: 'right' });
  docPdf.text('Costo', 193, y + 4.5, { align: 'right' });

  docPdf.setFont('helvetica', 'normal');
  filamentRows.forEach((f) => {
    y += 6;
    docPdf.rect(15, y, 180, 6, 'S');
    docPdf.text(f.productName.length > 25 ? `${f.productName.substring(0, 23)}...` : f.productName, 17, y + 4.5);
    docPdf.text(f.filDescription.length > 25 ? `${f.filDescription.substring(0, 23)}...` : f.filDescription, 75, y + 4.5);
    docPdf.text(f.grams.toFixed(0), 125, y + 4.5, { align: 'right' });
    docPdf.text(formatCurrency(f.precioKg), 155, y + 4.5, { align: 'right' });
    docPdf.setTextColor('#991b1b');
    docPdf.text(`- ${formatCurrency(f.costo)}`, 193, y + 4.5, { align: 'right' });
    docPdf.setTextColor(greyDark);
  });

  y += 6;
  docPdf.setFillColor('#e2e8f0');
  docPdf.rect(15, y, 180, 6, 'F');
  docPdf.rect(15, y, 180, 6, 'S');
  docPdf.setFont('helvetica', 'bold');
  docPdf.text('TOTAL FILAMENTO', 17, y + 4.5);
  docPdf.setTextColor('#7f1d1d');
  docPdf.text(`- ${formatCurrency(totalCostoFilamento)}`, 193, y + 4.5, { align: 'right' });
  docPdf.setTextColor(greyDark);

  // 4. COSTOS DE INSUMOS (IMPRESIÓN 3D)
  y += 12;
  sectionHeader('COSTOS DE INSUMOS (IMPRESIÓN 3D)', y);
  y += 6;
  docPdf.setFillColor('#ccfbf1'); // teal100
  docPdf.rect(15, y, 180, 6, 'F');
  docPdf.rect(15, y, 180, 6, 'S');
  docPdf.setFont('helvetica', 'bold');
  docPdf.text('Producto', 17, y + 4.5);
  docPdf.text('Insumo', 75, y + 4.5);
  docPdf.text('Cant.', 125, y + 4.5, { align: 'right' });
  docPdf.text('P. unit.', 155, y + 4.5, { align: 'right' });
  docPdf.text('Costo', 193, y + 4.5, { align: 'right' });

  docPdf.setFont('helvetica', 'normal');
  if (insumoRows.length === 0) {
    y += 6;
    docPdf.rect(15, y, 180, 6, 'S');
    docPdf.setTextColor(greyLight);
    docPdf.text('Sin insumos en ítems de impresión 3D', 17, y + 4.5);
    docPdf.setTextColor(greyDark);
  } else {
    insumoRows.forEach((r) => {
      y += 6;
      docPdf.rect(15, y, 180, 6, 'S');
      docPdf.text(r.productName, 17, y + 4.5);
      docPdf.text(r.insumoName, 75, y + 4.5);
      docPdf.text(r.cantidad.toFixed(0), 125, y + 4.5, { align: 'right' });
      docPdf.text(formatCurrency(r.precioUnit), 155, y + 4.5, { align: 'right' });
      docPdf.setTextColor('#991b1b');
      docPdf.text(`- ${formatCurrency(r.costo)}`, 193, y + 4.5, { align: 'right' });
      docPdf.setTextColor(greyDark);
    });
  }

  y += 6;
  docPdf.setFillColor('#e2e8f0');
  docPdf.rect(15, y, 180, 6, 'F');
  docPdf.rect(15, y, 180, 6, 'S');
  docPdf.setFont('helvetica', 'bold');
  docPdf.text('TOTAL INSUMOS', 17, y + 4.5);
  docPdf.setTextColor('#7f1d1d');
  docPdf.text(`- ${formatCurrency(totalCostoInsumo)}`, 193, y + 4.5, { align: 'right' });
  docPdf.setTextColor(greyDark);

  // Check Page height remaining
  if (y > 220) {
    docPdf.addPage();
    y = 15;
  }

  // 5. COSTOS VARIOS
  y += 12;
  sectionHeader('COSTOS VARIOS', y);
  y += 6;
  docPdf.setFillColor('#ffeed5'); // deepOrange100
  docPdf.rect(15, y, 180, 6, 'F');
  docPdf.rect(15, y, 180, 6, 'S');
  docPdf.setFont('helvetica', 'bold');
  docPdf.text('Concepto', 17, y + 4.5);
  docPdf.text('Detalle', 75, y + 4.5);
  docPdf.text('Costo', 193, y + 4.5, { align: 'right' });

  docPdf.setFont('helvetica', 'normal');
  // Row: Mantenimiento
  y += 6;
  docPdf.rect(15, y, 180, 6, 'S');
  docPdf.text('Mantenimiento', 17, y + 4.5);
  docPdf.text('Desgaste máquina', 75, y + 4.5);
  docPdf.setTextColor('#991b1b');
  docPdf.text(`- ${formatCurrency(totalCostoDesgaste)}`, 193, y + 4.5, { align: 'right' });
  docPdf.setTextColor(greyDark);

  // Row: Gasto energético
  y += 6;
  docPdf.rect(15, y, 180, 6, 'S');
  docPdf.text('Gasto energético', 17, y + 4.5);
  docPdf.text('Consumo eléctrico estimado', 75, y + 4.5);
  docPdf.setTextColor('#991b1b');
  docPdf.text(`- ${formatCurrency(totalCostoLuz)}`, 193, y + 4.5, { align: 'right' });
  docPdf.setTextColor(greyDark);

  // Row: Porcentaje de fallas
  y += 6;
  docPdf.rect(15, y, 180, 6, 'S');
  docPdf.text('Porcentaje de fallas', 17, y + 4.5);
  docPdf.text(`Margen de error ${pricing3d?.errorMarginPercent || 10}%`, 75, y + 4.5);
  docPdf.setTextColor('#991b1b');
  docPdf.text(`- ${formatCurrency(totalCostoMargenError)}`, 193, y + 4.5, { align: 'right' });
  docPdf.setTextColor(greyDark);

  // Total
  y += 6;
  docPdf.setFillColor('#e2e8f0');
  docPdf.rect(15, y, 180, 6, 'F');
  docPdf.rect(15, y, 180, 6, 'S');
  docPdf.setFont('helvetica', 'bold');
  docPdf.text('TOTAL MANTENIMIENTO MÁQUINAS', 17, y + 4.5);
  docPdf.setTextColor('#7f1d1d');
  docPdf.text(`- ${formatCurrency(totalCostoDesgaste + totalCostoLuz + totalCostoMargenError)}`, 193, y + 4.5, { align: 'right' });
  docPdf.setTextColor(greyDark);

  // Centered footer
  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(8);
  docPdf.setTextColor(greyLight);
  docPdf.text('Documento confidencial - solo para el titular del negocio', 105, 285, { align: 'center' });

  docPdf.save(`Balance_PED-${getOrderDisplayCode(order).split('-').slice(1).join('-')}.pdf`);
};

export const generateBalancePDF = (balance: any, periodLabel: string, business: BusinessSettings, orders: Order[] = []) => {
  const docPdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const greyDark = '#1e293b';
  const greyLight = '#64748b';
  const borderGrey = '#cbd5e1';

  // 1. Header Layout
  const yStart = 15;
  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(20);
  docPdf.setTextColor(greyDark);
  docPdf.text('Balance financiero', 15, yStart + 6);
  
  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(10);
  docPdf.setTextColor(greyLight);
  docPdf.text(`${business.name} · Período: ${periodLabel}`, 15, yStart + 12);
  docPdf.text(`Generado: ${new Date().toLocaleDateString('es-AR')} ${new Date().toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'})}`, 15, yStart + 17);

  // Blue divider bar
  let y = yStart + 22;
  docPdf.setDrawColor('#1e40af'); // blue800
  docPdf.setLineWidth(1);
  docPdf.line(15, y, 195, y);

  const sectionHeader = (title: string, yPos: number) => {
    docPdf.setFillColor('#1e293b'); // grey800
    docPdf.rect(15, yPos, 180, 6, 'F');
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(8.5);
    docPdf.setTextColor('#ffffff');
    docPdf.text(title, 17, yPos + 4.5);
    docPdf.setTextColor(greyDark);
  };

  const drawBalanceTable = (headerColor: string, rows: any[], totalRow: any, yPos: number) => {
    let currentY = yPos;
    docPdf.setFillColor(headerColor);
    docPdf.rect(15, currentY, 180, 6, 'F');
    docPdf.setDrawColor(borderGrey);
    docPdf.setLineWidth(0.3);
    docPdf.rect(15, currentY, 180, 6, 'S');

    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(8);
    docPdf.text('Concepto', 17, currentY + 4.5);
    docPdf.text('Rubro', 110, currentY + 4.5);
    docPdf.text('Importe', 193, currentY + 4.5, { align: 'right' });

    docPdf.setFont('helvetica', 'normal');
    rows.forEach((row) => {
      currentY += 6;
      docPdf.rect(15, currentY, 180, 6, 'S');
      docPdf.text(row.concepto, 17, currentY + 4.5);
      docPdf.text(row.rubro, 110, currentY + 4.5);
      
      let prefix = '';
      if (row.kind === 'income') {
        prefix = '+ ';
        docPdf.setTextColor('#166534');
      } else if (row.kind === 'expense') {
        prefix = '- ';
        docPdf.setTextColor('#991b1b');
      } else {
        docPdf.setTextColor(greyDark);
      }
      docPdf.text(`${prefix}${formatCurrency(row.value)}`, 193, currentY + 4.5, { align: 'right' });
      docPdf.setTextColor(greyDark);
    });

    currentY += 6;
    docPdf.setFillColor('#e2e8f0'); // grey300 / grey200
    docPdf.rect(15, currentY, 180, 6, 'F');
    docPdf.rect(15, currentY, 180, 6, 'S');
    docPdf.setFont('helvetica', 'bold');
    docPdf.text(totalRow.concepto, 17, currentY + 4.5);
    docPdf.text(totalRow.rubro, 110, currentY + 4.5);
    
    let totalPrefix = totalRow.value >= 0 ? '+ ' : '- ';
    docPdf.setTextColor(totalRow.value >= 0 ? '#14532d' : '#7f1d1d');
    docPdf.text(`${totalPrefix}${formatCurrency(Math.abs(totalRow.value))}`, 193, currentY + 4.5, { align: 'right' });
    docPdf.setTextColor(greyDark);

    return currentY + 6;
  };

  // 1. IMPRESIÓN 3D Section
  y += 6;
  sectionHeader('IMPRESIÓN 3D', y);
  y += 6;
  y = drawBalanceTable(
    '#eff6ff', // blue50
    [
      { concepto: 'Costos de filamentos', rubro: 'Costos', value: balance.cost3DDetails?.filament || 0, kind: 'expense' },
      { concepto: 'Costos de insumos', rubro: 'Costos', value: balance.cost3DDetails?.insumos || 0, kind: 'expense' },
      { concepto: 'Costo de mantenimiento de máquinas', rubro: 'Costos', value: balance.cost3DDetails?.maintenance || 0, kind: 'expense' },
      { concepto: 'Costo de consumo eléctrico', rubro: 'Costos', value: balance.cost3DDetails?.electricity || 0, kind: 'expense' },
      { concepto: 'Productos señados', rubro: 'Comprometido', value: balance.signals3D || 0, kind: 'neutral' },
      { concepto: 'Falta por cobrar', rubro: 'Cobros', value: balance.pending3D || 0, kind: 'neutral' },
      { concepto: 'Total de ingresos (catálogo)', rubro: 'Ingresos', value: balance.paid3D || 0, kind: 'income' }
    ],
    { concepto: 'Ganancia real', rubro: 'Resultado', value: balance.profit3D || 0 },
    y
  );

  // 2. REVENTA Section
  y += 6;
  sectionHeader('REVENTA', y);
  y += 6;
  y = drawBalanceTable(
    '#fef3c7', // amber100
    [
      { concepto: 'Costo de productos', rubro: 'Costos', value: balance.costResale || 0, kind: 'expense' },
      { concepto: 'Ingreso total', rubro: 'Ingresos', value: balance.paidResale || 0, kind: 'income' }
    ],
    { concepto: 'Ganancia real', rubro: 'Resultado', value: balance.profitResale || 0 },
    y
  );

  // DETALLE DE PEDIDOS DEL PERÍODO Section
  y += 8;
  if (y > 220) {
    docPdf.addPage();
    y = 15;
  }
  sectionHeader('DETALLE DE PEDIDOS DEL PERÍODO', y);
  y += 6;

  if (orders.length === 0) {
    docPdf.rect(15, y, 180, 8, 'S');
    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(8.5);
    docPdf.setTextColor(greyLight);
    docPdf.text('No hay pedidos en este período.', 17, y + 5);
    docPdf.setTextColor(greyDark);
  } else {
    docPdf.setFillColor('#e0e7ff'); // indigo100
    docPdf.rect(15, y, 180, 6, 'F');
    docPdf.rect(15, y, 180, 6, 'S');
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(8);
    docPdf.text('Pedido / fecha', 17, y + 4.5);
    docPdf.text('Cliente / estado', 65, y + 4.5);
    docPdf.text('Total', 150, y + 4.5, { align: 'right' });
    docPdf.text('Pagado', 193, y + 4.5, { align: 'right' });

    docPdf.setFont('helvetica', 'normal');
    orders.forEach((o) => {
      if (y > 270) {
        docPdf.addPage();
        y = 15;
        // re-render header row
        docPdf.setFillColor('#e0e7ff');
        docPdf.rect(15, y, 180, 6, 'F');
        docPdf.rect(15, y, 180, 6, 'S');
        docPdf.setFont('helvetica', 'bold');
        docPdf.text('Pedido / fecha', 17, y + 4.5);
        docPdf.text('Cliente / estado', 65, y + 4.5);
        docPdf.text('Total', 150, y + 4.5, { align: 'right' });
        docPdf.text('Pagado', 193, y + 4.5, { align: 'right' });
        y += 6;
        docPdf.setFont('helvetica', 'normal');
      }
      y += 8;
      docPdf.rect(15, y, 180, 8, 'S');
      const orderCode = getOrderDisplayCode(o);
      const dateText = formatDateOnly(o.date);
      docPdf.text(`${orderCode}\n${dateText}`, 17, y + 3, { lineHeightFactor: 1.1 });

      const statusMap = o.orderStatus === 'delivered' ? 'Entregado' : 
                        (o.orderStatus === 'finished' ? 'Terminado' : 
                        (o.orderStatus === 'pending' ? 'Pendiente' : 
                        (o.orderStatus === 'processing' ? 'En Proceso' : 'Cancelado')));
      docPdf.text(`${o.customerName}\n${statusMap}`, 65, y + 3, { lineHeightFactor: 1.1 });
      docPdf.text(formatCurrency(o.totalAmount), 150, y + 5.5, { align: 'right' });
      docPdf.text(formatCurrency(o.paidAmount), 193, y + 5.5, { align: 'right' });
    });

    // Total row
    y += 8;
    docPdf.setFillColor('#e2e8f0');
    docPdf.rect(15, y, 180, 6, 'F');
    docPdf.rect(15, y, 180, 6, 'S');
    docPdf.setFont('helvetica', 'bold');
    docPdf.text(`TOTAL PERÍODO (${orders.length} pedidos)`, 17, y + 4.5);
    docPdf.setTextColor('#166534');
    docPdf.text(formatCurrency(orders.reduce((acc, o) => acc + o.totalAmount, 0)), 150, y + 4.5, { align: 'right' });
    docPdf.text(formatCurrency(orders.reduce((acc, o) => acc + o.paidAmount, 0)), 193, y + 4.5, { align: 'right' });
    docPdf.setTextColor(greyDark);
  }

  // Footer
  y += 10;
  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(8);
  docPdf.setTextColor(greyLight);
  docPdf.text(`Documento generado desde ${business.name}.`, 15, 285);

  const safeRange = periodLabel
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\-]+/g, '');
  docPdf.save(`Balance_${safeRange}.pdf`);
};

export const generateInventoryOrderPDF = (
  items: Array<{
    name: string;
    brandOrCategory: string;
    typeDetail: string;
    quantity: number;
    unit: string;
  }>,
  orderType: 'filaments' | 'supplies',
  business: BusinessSettings
) => {
  const docPdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const greyDark = '#1e293b';
  const greyLight = '#64748b';

  // Header Layout matching Filar list
  let y = 15;
  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(13);
  docPdf.setTextColor(greyDark);
  docPdf.text(business.ownerName || 'Propietario', 15, y);

  y += 5.5;
  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(11);
  docPdf.text(business.name || 'Negocio', 15, y);

  y += 5.5;
  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(10);
  docPdf.setTextColor(greyLight);
  docPdf.text(`${business.address || ''}, ${business.city || ''}, ${business.province || ''}`, 15, y);

  y += 10;
  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(16);
  docPdf.setTextColor(greyDark);
  const typeLabel = orderType === 'filaments' ? 'Filamentos' : 'Insumos';
  docPdf.text(`Lista de pedido - ${typeLabel}`, 15, y);

  y += 10;
  docPdf.setDrawColor('#cbd5e1');
  docPdf.setLineWidth(0.3);

  let totalQty = 0;

  items.forEach((item) => {
    // Check page boundaries
    if (y > 260) {
      docPdf.addPage();
      y = 20;
    }

    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(11.5);
    docPdf.setTextColor(greyDark);
    
    // Line 1: Type • Brand/Category • Detail
    const line1 = `${item.typeDetail} • ${item.brandOrCategory} • ${item.name}`;
    docPdf.text(line1, 15, y);

    y += 5;
    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(9);
    docPdf.setTextColor(greyLight);
    const line2 = `${item.typeDetail} - ${item.brandOrCategory} - ${item.name}`;
    docPdf.text(line2, 15, y);

    y += 5;
    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(10);
    docPdf.setTextColor(greyDark);
    const qtyText = `${item.quantity} ${item.quantity === 1 ? item.unit : (item.unit + (item.unit === 'bobina' ? 's' : ''))}`;
    docPdf.text(qtyText, 15, y);

    totalQty += item.quantity;
    y += 10; // Space between items
  });

  // Check page boundaries for total block
  if (y > 260) {
    docPdf.addPage();
    y = 20;
  }

  // Draw Total section matching example: "Total 24 kg" (using kg estimation for filaments)
  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(12);
  docPdf.setTextColor(greyDark);
  const totalSuffix = orderType === 'filaments' ? `${totalQty} kg` : `${totalQty} unidades`;
  docPdf.text(`Total ${totalSuffix}`, 15, y);

  // Generado block: "Generado: 08/06/2026 09:47 - Lista de pedido (filamentos)"
  y += 10;
  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(7);
  docPdf.setTextColor(greyLight);
  const dateFormatted = new Date().toLocaleDateString('es-AR') + ' ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  docPdf.text(`Generado: ${dateFormatted} - Lista de pedido (${typeLabel.toLowerCase()})`, 15, y);

  const cleanName = typeLabel.replace(/\s+/g, '');
  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '') + '_' + new Date().toTimeString().slice(0, 8).replace(/:/g, '');
  docPdf.save(`Lista${cleanName}_Pedido_${dateStamp}.pdf`);
};

