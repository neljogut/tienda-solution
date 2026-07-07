import type { FieldValue } from 'firebase/firestore';

export type RepairStatus = 'received' | 'diagnosing' | 'budgeted' | 'repairing' | 'ready' | 'delivered' | 'cancelled';
export type RepairPriority = 'normal' | 'urgent';
export type DeviceType = 'cellphone' | 'pc' | 'other';

export interface RepairItem {
  description: string;
  amount: number;
}

export interface Repair {
  id: string;
  ticketCode: string;
  
  // Client data
  clientName: string;
  clientWhatsApp: string;
  clientWhatsAppClean: string;
  clientDni?: string;
  clientAddress?: string;
  clientEmail?: string;
  
  // Device data
  deviceType: DeviceType;
  deviceDetails: string;
  reportedFault: string;
  photoUrl?: string;
  
  // New fields
  unlockPin?: string;           // PIN/Pattern for testing
  pinType?: 'text' | 'pattern';
  patternImage?: string;
  priority: RepairPriority;     // Repair priority
  assignedTechnicianId?: string; // Assigned technician (user ID)
  assignedTechnicianName?: string;
  
  // Budget breakdown
  budgetItems: RepairItem[];    // Parts + labor breakdown
  totalBudget: number;          // Auto-calculated sum
  
  // Status & tracking
  status: RepairStatus;
  technicalDiagnosis: string;
  statusNotes: string;
  accessoriesLeft: string;
  
  // Timestamps
  createdAt: FieldValue; // Firestore timestamp
  updatedAt: FieldValue; // Firestore timestamp
}

export const REPAIR_STATUS_DETAILS: Record<RepairStatus, { label: string; color: string }> = {
  received: { label: 'Recibido', color: 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200' },
  diagnosing: { label: 'En Diagnóstico', color: 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200' },
  budgeted: { label: 'Presupuestado', color: 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200' },
  repairing: { label: 'En Reparación', color: 'bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-200' },
  ready: { label: 'Listo para retirar', color: 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200' },
  delivered: { label: 'Entregado', color: 'bg-slate-200 text-slate-600 border-slate-300 hover:bg-slate-300' },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200' }
};

export const REPAIR_PRIORITY_DETAILS: Record<RepairPriority, { label: string; color: string; icon: string }> = {
  normal: { label: 'Normal', color: 'bg-blue-100 text-blue-600', icon: '→' },
  urgent: { label: 'Urgente', color: 'bg-red-100 text-red-600', icon: '⚡' }
};
