import { jsPDF } from 'jspdf';
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

// Utility to format numbers as ARS currency
const formatCurrency = (amount: number) => {
  return `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const generateClientPDF = (order: Order, business: BusinessSettings) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const primaryColor = [37, 99, 235]; // Indigo/Blue #2563eb
  const darkTextColor = [30, 41, 59]; // Slate 800
  const lightTextColor = [100, 116, 139]; // Slate 500
  const borderLight = [226, 232, 240]; // Slate 200

  // Helper to set primary fill
  const setPrimaryFill = () => doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  const setDarkText = () => doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
  const setLightText = () => doc.setTextColor(lightTextColor[0], lightTextColor[1], lightTextColor[2]);

  // Header Banner
  setPrimaryFill();
  doc.rect(0, 0, 210, 35, 'F');

  // Business Name on Banner
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text(business.name.toUpperCase(), 15, 18);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(business.description || 'Venta y Servicios de Impresión 3D', 15, 25);

  // Document Title (Right align)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('COMPROBANTE DE PEDIDO', 195, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Pedido N°: #${order.orderNumber.toString().padStart(6, '0')}`, 195, 24, { align: 'right' });
  doc.text(`Fecha: ${formatDate(order.date).split(',')[0]}`, 195, 30, { align: 'right' });

  // Reset text color
  setDarkText();

  // Draw two column metadata blocks
  // Column 1: Business Details
  let y = 48;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('DATOS DE EMISOR:', 15, y);
  doc.setFont('helvetica', 'normal');
  y += 5;
  doc.text(`Propietario: ${business.ownerName}`, 15, y);
  y += 5;
  doc.text(`Teléfono: ${business.phone}`, 15, y);
  y += 5;
  doc.text(`Email: ${business.email}`, 15, y);
  y += 5;
  doc.text(`Dirección: ${business.address}, ${business.city}`, 15, y);
  if (business.cuit) {
    y += 5;
    doc.text(`CUIT: ${business.cuit}`, 15, y);
  }

  // Column 2: Customer Details
  y = 48;
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS DEL CLIENTE:', 110, y);
  doc.setFont('helvetica', 'normal');
  y += 5;
  doc.text(`Cliente: ${order.customerName}`, 110, y);
  y += 5;
  doc.text(`ID Cliente: #${order.customerId.slice(0, 8).toUpperCase()}`, 110, y);
  y += 5;
  doc.text(`Estado del Pedido: ${
    order.orderStatus === 'pending' ? 'Pendiente' :
    order.orderStatus === 'processing' ? 'En Proceso' :
    order.orderStatus === 'finished' ? 'Terminado' :
    order.orderStatus === 'delivered' ? 'Entregado' : 'Cancelado'
  }`, 110, y);
  y += 5;
  doc.text(`Estado del Pago: ${
    order.paymentStatus === 'unpaid' ? 'Sin Abonar' :
    order.paymentStatus === 'partial' ? 'Señado (Parcial)' : 'Pagado'
  }`, 110, y);
  if (order.deliveryDate) {
    y += 5;
    doc.text(`Fecha Entrega Pactada: ${formatDate(order.deliveryDate).split(',')[0]}`, 110, y);
  }

  // Table of Items Header
  y = 85;
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.setLineWidth(0.3);
  doc.line(15, y, 195, y);
  
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setLightText();
  doc.text('PRODUCTO', 17, y);
  doc.text('TIPO', 90, y);
  doc.text('CANTIDAD', 115, y, { align: 'right' });
  doc.text('PRECIO UNIT.', 150, y, { align: 'right' });
  doc.text('SUBTOTAL', 193, y, { align: 'right' });

  y += 3;
  doc.line(15, y, 195, y);
  
  // Render table rows
  setDarkText();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  
  order.items.forEach((item) => {
    y += 7;
    doc.text(item.name, 17, y);
    doc.text(item.type === '3d' ? 'Impresión 3D' : 'Reventa', 90, y);
    doc.text(item.quantity.toString(), 115, y, { align: 'right' });
    doc.text(formatCurrency(item.unitPrice), 150, y, { align: 'right' });
    doc.text(formatCurrency(item.unitPrice * item.quantity), 193, y, { align: 'right' });
  });

  y += 5;
  doc.line(15, y, 195, y);

  // Financial summary block
  y += 10;
  doc.setFontSize(10);
  
  // Draw summary container
  doc.setFillColor(248, 250, 252); // Light background slate-50
  doc.rect(120, y, 75, 30, 'F');
  doc.rect(120, y, 75, 30, 'S');

  let summaryY = y + 6;
  doc.setFont('helvetica', 'normal');
  doc.text('Monto Total:', 125, summaryY);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(order.totalAmount), 190, summaryY, { align: 'right' });

  summaryY += 8;
  doc.setFont('helvetica', 'normal');
  doc.text('Monto Abonado:', 125, summaryY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(16, 185, 129); // Emerald-500
  doc.text(formatCurrency(order.paidAmount), 190, summaryY, { align: 'right' });

  summaryY += 8;
  setDarkText();
  doc.setFont('helvetica', 'normal');
  doc.text('Saldo Pendiente:', 125, summaryY);
  doc.setFont('helvetica', 'bold');
  if (order.pendingAmount > 0) {
    doc.setTextColor(239, 68, 68); // Red-500
  }
  doc.text(formatCurrency(order.pendingAmount), 190, summaryY, { align: 'right' });

  // Reset styles
  setDarkText();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  // Observations block - place it safely below the summary box (which takes y to y + 30)
  if (order.observationsPublic) {
    doc.setFont('helvetica', 'bold');
    doc.text('OBSERVACIONES:', 15, y + 36);
    doc.setFont('helvetica', 'italic');
    setLightText();
    const splitObs = doc.splitTextToSize(order.observationsPublic, 95);
    doc.text(splitObs, 15, y + 42);
  }

  // Footer note
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('¡Gracias por tu compra y por confiar en nosotros!', 105, 275, { align: 'center' });

  // Save the PDF
  doc.save(`Pedido_${order.orderNumber.toString().padStart(6, '0')}_Cliente.pdf`);
};

export const generateInternalPDF = (order: Order, business: BusinessSettings) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const primaryColor = [79, 70, 229]; // Indigo-600 #4f46e5
  const darkTextColor = [30, 41, 59]; // Slate 800
  const lightTextColor = [100, 116, 139]; // Slate 500
  const borderLight = [226, 232, 240]; // Slate 200

  // Helpers
  const setDarkText = () => doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
  const setLightText = () => doc.setTextColor(lightTextColor[0], lightTextColor[1], lightTextColor[2]);

  // Header Banner
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, 210, 35, 'F');

  // Business Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text(`${business.name.toUpperCase()} — REPORTE INTERNO`, 15, 18);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('CONTROL DE COSTOS Y MÁRGENES DE GANANCIA', 15, 25);

  // Document Title (Right align)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('BALANCE DE VENTA', 195, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Pedido N°: #${order.orderNumber.toString().padStart(6, '0')}`, 195, 23, { align: 'right' });
  doc.text(`Cotización Dólar: ${order.exchangeRateUsdUsed ? `$${order.exchangeRateUsdUsed} ARS` : '—'}`, 195, 28, { align: 'right' });
  doc.text(`Fecha Pedido: ${formatDate(order.date)}`, 195, 33, { align: 'right' });

  // Reset text color
  setDarkText();

  // Meta Info
  let y = 48;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('INFORMACIÓN DE CONTROL:', 15, y);
  doc.setFont('helvetica', 'normal');
  y += 5;
  doc.text(`Operador / Negocio: ${business.ownerName}`, 15, y);
  y += 5;
  doc.text(`Cliente Asociado: ${order.customerName} (#${order.customerId.slice(0, 8).toUpperCase()})`, 15, y);
  y += 5;
  doc.text(`Método de Pago: ${order.paymentMethod ? order.paymentMethod.toUpperCase() : 'Sin definir'}`, 15, y);

  // Table of cost parameters used
  y = 70;
  doc.setFont('helvetica', 'bold');
  doc.text('DESGLOSE DE COSTOS Y PRECIOS POR PRODUCTO:', 15, y);
  
  y += 4;
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.line(15, y, 195, y);

  y += 5;
  doc.setFontSize(8);
  setLightText();
  doc.text('PRODUCTO', 17, y);
  doc.text('TIPO', 70, y);
  doc.text('CANT', 92, y, { align: 'right' });
  doc.text('COSTO UNIT.', 117, y, { align: 'right' });
  doc.text('COSTO TOT.', 140, y, { align: 'right' });
  doc.text('PRECIO VTA.', 165, y, { align: 'right' });
  doc.text('GANANCIA NET.', 193, y, { align: 'right' });

  y += 3;
  doc.line(15, y, 195, y);

  setDarkText();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  order.items.forEach((item) => {
    y += 7;
    
    // Check if manual price
    const labelName = item.isManualPrice ? `${item.name} (Manual)` : item.name;
    doc.text(labelName, 17, y);
    doc.text(item.type === '3d' ? '3D' : 'Reventa', 70, y);
    doc.text(item.quantity.toString(), 92, y, { align: 'right' });
    doc.text(formatCurrency(item.unitCost), 117, y, { align: 'right' });
    doc.text(formatCurrency(item.unitCost * item.quantity), 140, y, { align: 'right' });
    doc.text(formatCurrency(item.unitPrice), 165, y, { align: 'right' });
    
    const profit = item.unitProfit * item.quantity;
    doc.setFont('helvetica', 'bold');
    if (profit > 0) doc.setTextColor(16, 185, 129); // emerald
    else doc.setTextColor(239, 68, 68); // red
    doc.text(formatCurrency(profit), 193, y, { align: 'right' });
    
    setDarkText();
    doc.setFont('helvetica', 'normal');
  });

  y += 5;
  doc.line(15, y, 195, y);

  // Financial summary block
  y += 10;
  doc.setFillColor(248, 250, 252);
  doc.rect(110, y, 85, 45, 'F');
  doc.rect(110, y, 85, 45, 'S');

  let summaryY = y + 6;
  doc.text('Ingreso Total:', 115, summaryY);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(order.totalAmount), 190, summaryY, { align: 'right' });

  summaryY += 8;
  doc.setFont('helvetica', 'normal');
  doc.text('Costos Totales del Pedido:', 115, summaryY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(239, 68, 68); // Red-500
  doc.text(`-${formatCurrency(order.totalCost)}`, 190, summaryY, { align: 'right' });

  summaryY += 8;
  setDarkText();
  doc.setFont('helvetica', 'normal');
  doc.text('Ganancia Real Estimada:', 115, summaryY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(16, 185, 129); // Emerald-500
  doc.text(formatCurrency(order.totalProfit), 190, summaryY, { align: 'right' });

  summaryY += 8;
  setDarkText();
  doc.setFont('helvetica', 'normal');
  doc.text('Efectivo Cobrado en Turno:', 115, summaryY);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(order.paidAmount), 190, summaryY, { align: 'right' });

  summaryY += 8;
  doc.setFont('helvetica', 'normal');
  doc.text('Saldo Pendiente en CC:', 115, summaryY);
  doc.setFont('helvetica', 'bold');
  if (order.pendingAmount > 0) doc.setTextColor(217, 119, 6); // amber
  doc.text(formatCurrency(order.pendingAmount), 190, summaryY, { align: 'right' });

  // Reset styles
  setDarkText();
  doc.setFont('helvetica', 'normal');

  // Observations block
  if (order.observationsInternal) {
    doc.setFont('helvetica', 'bold');
    doc.text('OBSERVACIONES INTERNAS:', 15, y + 6);
    doc.setFont('helvetica', 'italic');
    setLightText();
    const splitObs = doc.splitTextToSize(order.observationsInternal, 85);
    doc.text(splitObs, 15, y + 12);
  }

  // Footer
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setLightText();
  doc.text('DOCUMENTO DE USO INTERNO EXCLUSIVO — PROHIBIDA SU DIVULGACIÓN A CLIENTES', 105, 280, { align: 'center' });

  // Save the PDF
  doc.save(`Pedido_${order.orderNumber.toString().padStart(6, '0')}_Interno.pdf`);
};

export const generateBalancePDF = (balance: any, periodLabel: string, business: BusinessSettings) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const primaryColor = [30, 41, 59]; // Slate-800
  const accentColor = [37, 99, 235]; // Blue-600
  const darkTextColor = [30, 41, 59]; // Slate 800
  const lightTextColor = [100, 116, 139]; // Slate 500
  const borderLight = [226, 232, 240]; // Slate 200

  // Helpers
  const setDarkText = () => doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
  const setLightText = () => doc.setTextColor(lightTextColor[0], lightTextColor[1], lightTextColor[2]);

  // Header Banner
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, 210, 35, 'F');

  // Business Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text(business.name.toUpperCase(), 15, 18);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`REPORTE DE BALANCE FINANCIERO — PERÍODO: ${periodLabel.toUpperCase()}`, 15, 25);

  // Document Title (Right align)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('BALANCE FINANCIERO', 195, 18, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`Generado: ${new Date().toLocaleDateString('es-AR')}`, 195, 25, { align: 'right' });

  // Reset text color
  setDarkText();

  // Column metrics
  let y = 48;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('RESUMEN DE BALANCE GENERAL', 15, y);
  
  y += 3;
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.line(15, y, 195, y);

  // Main Indicators Cards
  y += 8;
  doc.setFillColor(248, 250, 252);
  doc.rect(15, y, 55, 20, 'F');
  doc.rect(15, y, 55, 20, 'S');
  doc.setFontSize(8);
  setLightText();
  doc.text('INGRESOS TOTALES', 19, y + 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  setDarkText();
  doc.text(formatCurrency(balance.totalRevenue || 0), 19, y + 14);

  doc.setFillColor(248, 250, 252);
  doc.rect(75, y, 55, 20, 'F');
  doc.rect(75, y, 55, 20, 'S');
  doc.setFontSize(8);
  setLightText();
  doc.text('COSTOS TOTALES', 79, y + 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(239, 68, 68); // red
  doc.text(`-${formatCurrency(balance.totalCost || 0)}`, 79, y + 14);

  setDarkText();
  doc.setFillColor(240, 253, 244); // light green bg
  doc.rect(135, y, 60, 20, 'F');
  doc.setDrawColor(187, 247, 208); // green border
  doc.rect(135, y, 60, 20, 'S');
  doc.setFontSize(8);
  doc.setTextColor(21, 128, 61); // green text
  doc.text('GANANCIA REAL NETAS', 139, y + 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(formatCurrency(balance.totalProfit || 0), 139, y + 14);

  // Second row of indicators
  y += 24;
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.setFillColor(248, 250, 252);
  doc.rect(15, y, 42, 16, 'F');
  doc.rect(15, y, 42, 16, 'S');
  doc.setFontSize(7);
  setLightText();
  doc.text('EFECTIVO COBRADO', 18, y + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setDarkText();
  doc.text(formatCurrency(balance.totalPaid || 0), 18, y + 12);

  doc.setFillColor(248, 250, 252);
  doc.rect(62, y, 42, 16, 'F');
  doc.rect(62, y, 42, 16, 'S');
  doc.setFontSize(7);
  setLightText();
  doc.text('PENDIENTE COBRO', 65, y + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(217, 119, 6); // amber
  doc.text(formatCurrency(balance.totalPending || 0), 65, y + 12);

  setDarkText();
  doc.setFillColor(248, 250, 252);
  doc.rect(109, y, 42, 16, 'F');
  doc.rect(109, y, 42, 16, 'S');
  doc.setFontSize(7);
  setLightText();
  doc.text('CANT. PEDIDOS', 112, y + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setDarkText();
  doc.text((balance.orderCount || 0).toString(), 112, y + 12);

  doc.setFillColor(248, 250, 252);
  doc.rect(156, y, 39, 16, 'F');
  doc.rect(156, y, 39, 16, 'S');
  doc.setFontSize(7);
  setLightText();
  doc.text('TICKET PROMEDIO', 159, y + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setDarkText();
  doc.text(formatCurrency(balance.ticketAverage || 0), 159, y + 12);

  // Subsections 3D vs Reventa
  y += 24;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('DESGLOSE POR LÍNEA DE NEGOCIO', 15, y);
  
  y += 3;
  doc.line(15, y, 195, y);

  // Box 3D
  y += 5;
  doc.setFillColor(248, 250, 252);
  doc.rect(15, y, 85, 55, 'F');
  doc.rect(15, y, 85, 55, 'S');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.text('IMPRESIÓN 3D', 20, y + 6);
  
  setDarkText();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  let boxY = y + 14;
  doc.text(`Ingresos 3D:`, 20, boxY);
  doc.text(formatCurrency(balance.revenue3D || 0), 92, boxY, { align: 'right' });
  
  boxY += 6;
  doc.text(`  - Costo Filamentos:`, 20, boxY);
  doc.text(formatCurrency(balance.cost3DDetails?.filament || 0), 92, boxY, { align: 'right' });

  boxY += 6;
  doc.text(`  - Costo Eléctrico:`, 20, boxY);
  doc.text(formatCurrency(balance.cost3DDetails?.electricity || 0), 92, boxY, { align: 'right' });

  boxY += 6;
  doc.text(`  - Costo Mantenimiento:`, 20, boxY);
  doc.text(formatCurrency(balance.cost3DDetails?.maintenance || 0), 92, boxY, { align: 'right' });

  boxY += 6;
  doc.text(`  - Costo Insumos/Margen:`, 20, boxY);
  doc.text(formatCurrency(balance.cost3DDetails?.insumos || 0), 92, boxY, { align: 'right' });

  boxY += 8;
  doc.setFont('helvetica', 'bold');
  doc.text(`Ganancia Neta 3D:`, 20, boxY);
  doc.setTextColor(21, 128, 61);
  doc.text(formatCurrency(balance.profit3D || 0), 92, boxY, { align: 'right' });

  // Box Reventa
  setDarkText();
  doc.setFillColor(248, 250, 252);
  doc.rect(110, y, 85, 55, 'F');
  doc.rect(110, y, 85, 55, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.text('REVENTA DE PRODUCTOS', 115, y + 6);

  setDarkText();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  boxY = y + 14;
  doc.text(`Ingresos Reventa:`, 115, boxY);
  doc.text(formatCurrency(balance.revenueResale || 0), 187, boxY, { align: 'right' });
  
  boxY += 6;
  doc.text(`Costo de Compra total:`, 115, boxY);
  doc.text(formatCurrency(balance.costResale || 0), 187, boxY, { align: 'right' });

  boxY += 6;
  doc.text(`Cobrado Reventa:`, 115, boxY);
  doc.text(formatCurrency(balance.paidResale || 0), 187, boxY, { align: 'right' });

  boxY += 6;
  doc.text(`Pendiente Reventa:`, 115, boxY);
  doc.text(formatCurrency(balance.pendingResale || 0), 187, boxY, { align: 'right' });

  boxY += 14;
  doc.setFont('helvetica', 'bold');
  doc.text(`Ganancia Reventa:`, 115, boxY);
  doc.setTextColor(21, 128, 61);
  doc.text(formatCurrency(balance.profitResale || 0), 187, boxY, { align: 'right' });

  // Tops (Products / Clients)
  setDarkText();
  y += 63;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('PRODUCTOS TOP Y ANÁLISIS DE VENTAS', 15, y);
  
  y += 3;
  doc.line(15, y, 195, y);

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Producto Más Vendido:', 15, y);
  doc.setFont('helvetica', 'bold');
  doc.text(`${balance.topSoldProduct?.name || '—'} (${balance.topSoldProduct?.quantity || 0} unidades)`, 70, y);

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text('Producto Menos Vendido:', 15, y);
  doc.setFont('helvetica', 'bold');
  doc.text(`${balance.leastSoldProduct?.name || '—'} (${balance.leastSoldProduct?.quantity || 0} unidades)`, 70, y);

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text('Producto con Mayor Ganancia:', 15, y);
  doc.setFont('helvetica', 'bold');
  doc.text(`${balance.topProfitProduct?.name || '—'} (${formatCurrency(balance.topProfitProduct?.profit || 0)})`, 70, y);

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text('Producto con Mayor Margen:', 15, y);
  doc.setFont('helvetica', 'bold');
  doc.text(`${balance.topMarginProduct?.name || '—'} (${(balance.topMarginProduct?.margin || 0).toFixed(1)}% de margen)`, 70, y);

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text('Cliente con Mayor Compra:', 15, y);
  doc.setFont('helvetica', 'bold');
  doc.text(`${balance.topClient?.name || '—'} (${formatCurrency(balance.topClient?.purchased || 0)})`, 70, y);

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text('Cliente con Mayor Deuda:', 15, y);
  doc.setFont('helvetica', 'bold');
  doc.text(`${balance.topDebtClient?.name || '—'} (${formatCurrency(balance.topDebtClient?.debt || 0)})`, 70, y);

  // Footer
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setLightText();
  doc.text('REPORTE CONFIDENCIAL GENERADO AUTOMÁTICAMENTE PARA DUALGI 3D', 105, 280, { align: 'center' });

  // Save the PDF
  doc.save(`Reporte_Balance_${periodLabel.replace(/\s+/g, '_')}.pdf`);
};
