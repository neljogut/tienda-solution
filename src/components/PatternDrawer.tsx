import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Trash2, Check } from 'lucide-react';

interface PatternDrawerProps {
  onPatternSave: (patternImage: string) => void;
  initialPattern?: string;
  size?: number;
}

interface Point {
  x: number;
  y: number;
  index: number;
}

const GRID_SIZE = 3;
const DOT_RADIUS = 12;
const PADDING = 30;

export const PatternDrawer: React.FC<PatternDrawerProps> = ({ 
  onPatternSave, 
  initialPattern,
  size = 250 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedPoints, setSelectedPoints] = useState<Point[]>([]);
  const [currentPos, setCurrentPos] = useState<{x: number; y: number} | null>(null);
  const [saved, setSaved] = useState(!!initialPattern);

  const cellSize = (size - PADDING * 2) / GRID_SIZE;
  const dots: Point[] = [];

  // Generate dot positions
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      dots.push({
        x: PADDING + col * cellSize + cellSize / 2,
        y: PADDING + row * cellSize + cellSize / 2,
        index: row * GRID_SIZE + col
      });
    }
  }

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, size, size);

    // Draw grid lines (subtle)
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE - 1; j++) {
        // Horizontal
        ctx.beginPath();
        ctx.moveTo(PADDING + j * cellSize + cellSize / 2, PADDING + i * cellSize + cellSize / 2);
        ctx.lineTo(PADDING + (j + 1) * cellSize + cellSize / 2, PADDING + i * cellSize + cellSize / 2);
        ctx.stroke();
        // Vertical
        ctx.beginPath();
        ctx.moveTo(PADDING + i * cellSize + cellSize / 2, PADDING + j * cellSize + cellSize / 2);
        ctx.lineTo(PADDING + i * cellSize + cellSize / 2, PADDING + (j + 1) * cellSize + cellSize / 2);
        ctx.stroke();
      }
    }

    // Draw connection lines
    if (selectedPoints.length > 1) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(selectedPoints[0].x, selectedPoints[0].y);
      for (let i = 1; i < selectedPoints.length; i++) {
        ctx.lineTo(selectedPoints[i].x, selectedPoints[i].y);
      }
      if (isDrawing && currentPos) {
        ctx.lineTo(currentPos.x, currentPos.y);
      }
      ctx.stroke();
    }

    // Draw dots with connection order numbers
    dots.forEach((dot) => {
      const isSelected = selectedPoints.some(p => p.index === dot.index);
      const selectionOrder = selectedPoints.findIndex(p => p.index === dot.index);
      
      // Outer circle
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#3b82f6' : '#f1f5f9';
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#2563eb' : '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Only show number for selected points (connection order)
      if (isSelected) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${DOT_RADIUS * 0.9}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(selectionOrder + 1), dot.x, dot.y);
      }
    });
  }, [selectedPoints, isDrawing, currentPos, dots, size, cellSize]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const getClosestPoint = (x: number, y: number): Point | null => {
    let closest: Point | null = null;
    let minDist = DOT_RADIUS * 2;

    dots.forEach((dot) => {
      const dist = Math.sqrt((x - dot.x) ** 2 + (y - dot.y) ** 2);
      if (dist < minDist) {
        minDist = dist;
        closest = dot;
      }
    });

    return closest;
  };

  const handleStart = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    const point = getClosestPoint(x, y);
    if (point) {
      setIsDrawing(true);
      setSelectedPoints([point]);
      setSaved(false);
    }
  };

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    setCurrentPos({ x, y });

    const point = getClosestPoint(x, y);
    if (point && !selectedPoints.some(p => p.index === point.index)) {
      setSelectedPoints(prev => [...prev, point]);
    }
  };

  const handleEnd = () => {
    setIsDrawing(false);
    setCurrentPos(null);
  };

  const handleClear = () => {
    setSelectedPoints([]);
    setSaved(false);
  };

  const handleSave = () => {
    if (selectedPoints.length < 4) {
      alert('El patrón debe tener al menos 4 puntos conectados');
      return;
    }
    
    const canvas = canvasRef.current;
    if (canvas) {
      const imageData = canvas.toDataURL('image/png');
      onPatternSave(imageData);
      setSaved(true);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div 
          className="relative bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 p-2"
          style={{ width: size + 16, height: size + 16 }}
        >
          <canvas
            ref={canvasRef}
            width={size}
            height={size}
            className="cursor-pointer touch-none"
            onMouseDown={handleStart}
            onMouseMove={handleMove}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            onTouchStart={handleStart}
            onTouchMove={handleMove}
            onTouchEnd={handleEnd}
          />
          {saved && (
            <div className="absolute top-3 right-3 bg-emerald-500 text-white rounded-full p-1">
              <Check size={12} />
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleClear}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
        >
          <Trash2 size={12} />
          Limpiar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={selectedPoints.length < 4}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Check size={12} />
          Guardar Patrón
        </button>
      </div>

      <p className="text-[10px] text-slate-400 font-semibold">
        Dibujá conectando al menos 4 puntos. El patrón se guardará como imagen.
      </p>
    </div>
  );
};
