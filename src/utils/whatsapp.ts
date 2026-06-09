export function normalizeWhatsAppPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function buildWhatsAppUrl(phone: string, message?: string): string {
  const clean = normalizeWhatsAppPhone(phone);
  if (!clean) return '';
  const base = `https://wa.me/${clean}`;
  if (!message?.trim()) return base;
  return `${base}?text=${encodeURIComponent(message.trim())}`;
}

export function openWhatsApp(phone: string, message?: string): void {
  const url = buildWhatsAppUrl(phone, message);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}
