import React from 'react';
import type { Category } from '../types/category';
import { getSortedCategoryTree } from '../utils/categories';

interface CategoryTreeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (categoryId: string | null) => void;
  categories: Category[];
}

/**
 * Simple modal displaying category hierarchy for selection.
 * Renders a sorted tree using `getSortedCategoryTree` for proper ordering.
 */
export const CategoryTreeModal: React.FC<CategoryTreeModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  categories,
}) => {
  if (!isOpen) return null;

  // Build sorted tree with depth info
  const sortedTree = getSortedCategoryTree(categories, {} as any);

  // Helper to render each node with indentation based on depth
  const renderNode = (node: Category & { depth: number }) => {
    const indent = node.depth * 1.5; // rem units for visual indent
    return (
      <div
        key={node.id}
        className="flex items-center py-2 cursor-pointer hover:bg-slate-100"
        style={{ paddingLeft: `${indent}rem` }}
        onClick={() => {
          onSelect(node.id);
          onClose();
        }}
      >
        <span className="text-slate-800">{node.name}</span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/30">
      <div className="bg-white rounded-xl shadow-lg w-96 max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Seleccionar categoría</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className="p-4">
          {/* Option for no category */}
          <div
            className="flex items-center py-2 cursor-pointer hover:bg-slate-100"
            onClick={() => {
              onSelect(null);
              onClose();
            }}
          >
            <span className="text-slate-600 font-medium">Sin categoría</span>
          </div>
          {/* Category tree */}
          {sortedTree.map(renderNode)}
        </div>
        <div className="p-4 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 text-slate-800 rounded hover:bg-slate-300"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

export default CategoryTreeModal;
