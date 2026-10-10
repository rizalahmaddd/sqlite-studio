import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Key, 
  Link2, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw,
  Table as TableIcon,
  Maximize2
} from 'lucide-react';
import type { TableSchema } from '../types/database';

interface VisualErdProps {
  tables: TableSchema[];
  onSelectTable: (tableName: string) => void;
}

interface TablePosition {
  x: number;
  y: number;
}

function computeInitialPositions(tables: TableSchema[]): Record<string, TablePosition> {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const initialPos: Record<string, TablePosition> = {};
  const cols = isMobile ? 1 : 3;
  const cardWidth = 260;
  const cardHeight = 260;
  const gapX = isMobile ? 20 : 80;
  const gapY = isMobile ? 40 : 60;
  const startX = isMobile ? 20 : 60;
  const startY = isMobile ? 30 : 60;

  tables.forEach((tbl, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    initialPos[tbl.name] = {
      x: startX + col * (cardWidth + gapX),
      y: startY + row * (cardHeight + gapY)
    };
  });
  return initialPos;
}

export const VisualErd: React.FC<VisualErdProps> = ({ tables, onSelectTable }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  
  // View transform states
  const [zoom, setZoom] = useState(() => isMobile ? 0.75 : 1);
  const [pan, setPan] = useState(() => isMobile ? { x: 20, y: 30 } : { x: 50, y: 50 });
  
  // Canvas Panning states
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Draggable Table Node states
  const [positions, setPositions] = useState<Record<string, TablePosition>>(() => computeInitialPositions(tables));
  const [draggingTable, setDraggingTable] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hoveredTable, setHoveredTable] = useState<string | null>(null);

  // Multi-touch Pinch to Zoom states
  const touchDistanceRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1);
  const prevTablesRef = useRef(tables);

  // Sync positions when tables list changes
  useEffect(() => {
    if (prevTablesRef.current !== tables) {
      prevTablesRef.current = tables;
      setPositions(computeInitialPositions(tables));
    }
  }, [tables]);

  // Extract all foreign key links
  const relationships = useMemo(() => {
    const links: {
      fromTable: string;
      fromCol: string;
      toTable: string;
      toCol: string;
      key: string;
    }[] = [];

    tables.forEach(tbl => {
      tbl.foreignKeys.forEach((fk, idx) => {
        links.push({
          fromTable: tbl.name,
          fromCol: fk.from,
          toTable: fk.table,
          toCol: fk.to,
          key: `${tbl.name}-${fk.from}-${fk.table}-${idx}`
        });
      });
    });

    return links;
  }, [tables]);

  // Reset or Fit View
  const handleResetView = () => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    if (isMobile) {
      setZoom(0.75);
      setPan({ x: 20, y: 30 });
    } else {
      setZoom(1);
      setPan({ x: 50, y: 50 });
    }
  };

  // Center & Fit all tables in viewport
  const handleFitView = () => {
    if (tables.length === 0 || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pad = 40;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    Object.values(positions).forEach(pos => {
      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.x + 260 > maxX) maxX = pos.x + 260;
      if (pos.y + 260 > maxY) maxY = pos.y + 260;
    });

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    if (contentWidth <= 0 || contentHeight <= 0) return;

    const scaleX = (rect.width - pad * 2) / contentWidth;
    const scaleY = (rect.height - pad * 2) / contentHeight;
    const targetZoom = Math.min(1.5, Math.max(0.4, Math.min(scaleX, scaleY)));

    setZoom(targetZoom);
    setPan({
      x: (rect.width - contentWidth * targetZoom) / 2 - minX * targetZoom,
      y: (rect.height - contentHeight * targetZoom) / 2 - minY * targetZoom
    });
  };

  // ==========================================
  // UNIFIED POINTER & TOUCH GESTURE HANDLERS
  // ==========================================

  // 1. Canvas Pan: Pointer Down
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // If target is inside a table card, card drag handles it
    if ((e.target as HTMLElement).closest('.erd-node')) return;

    // Start panning
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignored for non-capturing browsers
    }
  };

  // 2. Global Pointer Move (Pan canvas or Drag table)
  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    } else if (draggingTable) {
      setPositions(prev => ({
        ...prev,
        [draggingTable]: {
          x: (e.clientX - pan.x) / zoom - dragOffset.x,
          y: (e.clientY - pan.y) / zoom - dragOffset.y
        }
      }));
    }
  };

  // 3. Pointer Up
  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsPanning(false);
    setDraggingTable(null);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignored
    }
  };

  // 4. Start Dragging a Table Node (Works on Desktop Mouse & Mobile Touch)
  const handleStartDragTable = (e: React.PointerEvent<HTMLDivElement>, tableName: string) => {
    e.stopPropagation();
    const currentPos = positions[tableName] || { x: 0, y: 0 };
    setDraggingTable(tableName);
    setDragOffset({
      x: (e.clientX - pan.x) / zoom - currentPos.x,
      y: (e.clientY - pan.y) / zoom - currentPos.y
    });

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignored
    }
  };

  // 5. Multi-touch Pinch to Zoom (Mobile 2-finger gesture)
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      touchDistanceRef.current = dist;
      initialZoomRef.current = zoom;
      setIsPanning(false);
      setDraggingTable(null);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchDistanceRef.current !== null) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const scale = dist / touchDistanceRef.current;
      const newZoom = Math.min(2.5, Math.max(0.3, initialZoomRef.current * scale));
      setZoom(newZoom);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      touchDistanceRef.current = null;
    }
  };

  // 6. Wheel Zoom (Desktop Trackpad & Mouse Wheel)
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.06 : 0.06;
      setZoom(z => Math.min(2.5, Math.max(0.3, z + delta)));
    }
  };

  return (
    <div 
      className="erd-canvas-container"
      ref={containerRef}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      onPointerCancel={handleCanvasPointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      style={{
        flex: 1,
        height: '100%',
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#070a12',
        backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        cursor: isPanning || draggingTable ? 'grabbing' : 'grab',
        userSelect: 'none',
        touchAction: 'none' // CRITICAL: prevents browser scroll/pinch hijack
      }}
    >
      {/* Floating Toolbar Controls */}
      <div 
        style={{
          position: 'absolute',
          top: '14px',
          right: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          zIndex: 40,
          backgroundColor: 'var(--bg-surface-elevated)',
          padding: '4px 8px',
          borderRadius: '10px',
          border: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-md)',
          pointerEvents: 'auto'
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button 
          className="btn btn-sm btn-ghost" 
          onClick={() => setZoom(z => Math.min(2.5, z + 0.15))} 
          title="Perbesar (Zoom In)"
          style={{ padding: '6px' }}
        >
          <ZoomIn size={15} />
        </button>

        <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)', minWidth: '38px', textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>

        <button 
          className="btn btn-sm btn-ghost" 
          onClick={() => setZoom(z => Math.max(0.3, z - 0.15))} 
          title="Perkecil (Zoom Out)"
          style={{ padding: '6px' }}
        >
          <ZoomOut size={15} />
        </button>

        <button 
          className="btn btn-sm btn-ghost" 
          onClick={handleFitView} 
          title="Paskan ke Layar (Fit View)"
          style={{ padding: '6px' }}
        >
          <Maximize2 size={14} />
        </button>

        <button 
          className="btn btn-sm btn-ghost" 
          onClick={handleResetView} 
          title="Reset Posisi & Zoom"
          style={{ padding: '6px' }}
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* Floating Legend / Stats */}
      <div 
        style={{
          position: 'absolute',
          bottom: '14px',
          left: '14px',
          zIndex: 40,
          backgroundColor: 'var(--bg-surface-elevated)',
          padding: '6px 12px',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)',
          fontSize: '11.5px',
          color: 'var(--text-secondary)',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          pointerEvents: 'auto',
          boxShadow: 'var(--shadow-sm)'
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span>Tabel: <b style={{ color: 'var(--text-primary)' }}>{tables.length}</b></span>
        <span>Relasi: <b style={{ color: 'var(--accent-light)' }}>{relationships.length}</b></span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6366f1' }} />
          <span>Foreign Key</span>
        </div>
      </div>

      {/* Scalable & Pannable Canvas Layer */}
      <div 
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          transformOrigin: '0 0',
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none' // Allow canvas background to receive clicks
        }}
      >
        {/* SVG Relationship Connector Lines */}
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '5000px', height: '5000px', pointerEvents: 'none', zIndex: 1 }}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#6366f1" />
            </marker>
            <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#a855f7" />
            </marker>
          </defs>

          {relationships.map(rel => {
            const sourcePos = positions[rel.fromTable];
            const targetPos = positions[rel.toTable];
            if (!sourcePos || !targetPos) return null;

            const isHighlighted = hoveredTable === rel.fromTable || hoveredTable === rel.toTable;

            const nodeWidth = 260;
            const nodeHeight = 160;

            const x1 = sourcePos.x + nodeWidth;
            const y1 = sourcePos.y + nodeHeight / 2;
            const x2 = targetPos.x;
            const y2 = targetPos.y + nodeHeight / 2;

            const dx = Math.abs(x2 - x1) * 0.5;
            const pathData = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

            return (
              <g key={rel.key}>
                <path
                  d={pathData}
                  fill="none"
                  stroke={isHighlighted ? '#a855f7' : '#6366f1'}
                  strokeWidth={isHighlighted ? '2.5' : '1.8'}
                  strokeDasharray={isHighlighted ? 'none' : '4 3'}
                  markerEnd={isHighlighted ? 'url(#arrow-active)' : 'url(#arrow)'}
                  opacity={isHighlighted ? 1 : 0.65}
                />
              </g>
            );
          })}
        </svg>

        {/* Table Node Cards */}
        {tables.map(tbl => {
          const pos = positions[tbl.name] || { x: 0, y: 0 };
          const isHovered = hoveredTable === tbl.name;
          const isBeingDragged = draggingTable === tbl.name;

          return (
            <div
              key={tbl.name}
              className="erd-node"
              onPointerDown={(e) => handleStartDragTable(e, tbl.name)}
              onMouseEnter={() => setHoveredTable(tbl.name)}
              onMouseLeave={() => setHoveredTable(null)}
              style={{
                position: 'absolute',
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                width: '260px',
                backgroundColor: 'var(--bg-surface)',
                borderRadius: '10px',
                border: `1.5px solid ${isHovered || isBeingDragged ? 'var(--accent-light)' : 'var(--border-default)'}`,
                boxShadow: isHovered || isBeingDragged ? '0 12px 30px rgba(99, 102, 241, 0.35)' : 'var(--shadow-md)',
                zIndex: isBeingDragged ? 50 : isHovered ? 30 : 10,
                cursor: isBeingDragged ? 'grabbing' : 'grab',
                pointerEvents: 'auto',
                touchAction: 'none',
                transition: isBeingDragged ? 'none' : 'box-shadow 0.2s, border-color 0.2s'
              }}
            >
              {/* Card Header (Drag handle & Quick Jump) */}
              <div 
                style={{
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-sidebar)',
                  borderTopLeftRadius: '9px',
                  borderTopRightRadius: '9px',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: isBeingDragged ? 'grabbing' : 'grab'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <TableIcon size={14} color="var(--accent-light)" />
                  <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tbl.name}
                  </span>
                </div>
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ padding: '2px 6px', fontSize: '10.5px' }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectTable(tbl.name);
                  }}
                  title="Buka Data Tabel"
                >
                  Lihat Data
                </button>
              </div>

              {/* Column List */}
              <div 
                style={{ 
                  maxHeight: '220px', 
                  overflowY: 'auto', 
                  padding: '6px 0',
                  touchAction: 'pan-y' // Allow internal scroll if card has many columns
                }}
                onPointerDown={(e) => e.stopPropagation()} // Don't drag card when scrolling columns
              >
                {tbl.columns.map(col => {
                  const isFk = tbl.foreignKeys.some(fk => fk.from === col.name);
                  return (
                    <div
                      key={col.name}
                      style={{
                        padding: '4px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '11.5px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.02)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {col.pk ? (
                          <span title="Primary Key" style={{ display: 'inline-flex' }}><Key size={11} color="#f59e0b" /></span>
                        ) : isFk ? (
                          <span title="Foreign Key" style={{ display: 'inline-flex' }}><Link2 size={11} color="#a855f7" /></span>
                        ) : (
                          <span style={{ width: '11px' }} />
                        )}
                        <span style={{ fontWeight: col.pk ? 600 : 400, color: col.pk ? '#f8fafc' : '#cbd5e1' }}>
                          {col.name}
                        </span>
                      </div>
                      <span className="font-mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {col.type || 'TEXT'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Card Footer: Row count & FK count */}
              <div style={{
                padding: '6px 12px',
                borderTop: '1px solid var(--border-subtle)',
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                borderBottomLeftRadius: '9px',
                borderBottomRightRadius: '9px',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '10.5px',
                color: 'var(--text-muted)'
              }}>
                <span>Rows: <b className="font-mono" style={{ color: 'var(--text-secondary)' }}>{tbl.rowCount.toLocaleString()}</b></span>
                <span>FKs: <b className="font-mono">{tbl.foreignKeys.length}</b></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
