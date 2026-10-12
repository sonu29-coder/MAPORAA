import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Button, IconButton, Tooltip, Card, CardContent,
  TextField, Select, MenuItem, FormControl, InputLabel, Alert,
  Chip, CircularProgress, Divider, Stack
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  ZoomIn, ZoomOut, Maximize2, Grid, MousePointer, Plus,
  DoorOpen, Tag, Trash2, Undo2, Redo2, Save, RotateCcw,
  Box as CubeIcon, Download, AlertTriangle, Check
} from 'lucide-react';

interface Wall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  type: string;
}

interface Door {
  id: string;
  x: number;
  y: number;
  width: number;
  rotation: number;
  label: string;
}

interface Room {
  id: string;
  name: string;
  polygon: number[][];
  color: string;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

type ToolMode = 'select' | 'add_wall' | 'add_door' | 'add_room';

export const MapEditor: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('Floor Plan');
  const [revisionName, setRevisionName] = useState('Initial Reconstruction');
  const [versionNumber, setVersionNumber] = useState(1);
  const [isPreliminary, setIsPreliminary] = useState(true);
  const [uncertaintyNotes, setUncertaintyNotes] = useState('');

  // Geometry state
  const [walls, setWalls] = useState<Wall[]>([]);
  const [doors, setDoors] = useState<Door[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bounds, setBounds] = useState<Bounds>({ minX: -5, minY: -5, maxX: 5, maxY: 5, width: 10, height: 10 });

  // History for Undo / Redo
  const [history, setHistory] = useState<{ walls: Wall[]; doors: Door[]; rooms: Room[] }[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  // Canvas Viewport (Zoom & Pan)
  const [zoom, setZoom] = useState(35); // pixels per meter
  const [pan, setPan] = useState({ x: 350, y: 300 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Tools & Selection
  const [tool, setTool] = useState<ToolMode>('select');
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'wall' | 'door' | 'room' | null>(null);

  // Drawing new wall temporary state
  const [wallStart, setWallStart] = useState<{ x: number; y: number } | null>(null);

  // Save feedback
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);

  // Load project & map data
  const loadMapData = async () => {
    try {
      setLoading(true);
      setError(null);

      const pRes = await api.get(`/projects/${projectId}`);
      setProjectName(pRes.data.name);

      const mRes = await api.get(`/projects/${projectId}/map`);
      const data = mRes.data;
      setWalls(data.walls || []);
      setDoors(data.doors || []);
      setRooms(data.rooms || []);
      if (data.bounds && data.bounds.width) setBounds(data.bounds);
      setVersionNumber(data.version_number || 1);
      setRevisionName(data.revision_name || `Revision v${data.version_number}`);
      setIsPreliminary(data.is_preliminary ?? true);
      setUncertaintyNotes(data.uncertainty_notes || '');

      // Initialize history
      setHistory([{ walls: data.walls || [], doors: data.doors || [], rooms: data.rooms || [] }]);
      setHistoryIdx(0);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'No floor plan available yet for this project.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMapData();
  }, [projectId]);

  // Push new state to history
  const pushHistory = (newWalls: Wall[], newDoors: Door[], newRooms: Room[]) => {
    const updated = history.slice(0, historyIdx + 1);
    updated.push({ walls: newWalls, doors: newDoors, rooms: newRooms });
    setHistory(updated);
    setHistoryIdx(updated.length - 1);
  };

  const handleUndo = () => {
    if (historyIdx > 0) {
      const prev = history[historyIdx - 1];
      setWalls(prev.walls);
      setDoors(prev.doors);
      setRooms(prev.rooms);
      setHistoryIdx(historyIdx - 1);
      setSelectedId(null);
    }
  };

  const handleRedo = () => {
    if (historyIdx < history.length - 1) {
      const next = history[historyIdx + 1];
      setWalls(next.walls);
      setDoors(next.doors);
      setRooms(next.rooms);
      setHistoryIdx(historyIdx + 1);
      setSelectedId(null);
    }
  };

  // Screen to World coordinates (Meters)
  const screenToWorld = (screenX: number, screenY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const relX = screenX - rect.left - pan.x;
    const relY = screenY - rect.top - pan.y;
    let worldX = relX / zoom;
    let worldY = relY / zoom;

    if (snapToGrid) {
      worldX = Math.round(worldX * 2) / 2; // snap to 0.5m
      worldY = Math.round(worldY * 2) / 2;
    }
    return { x: Number(worldX.toFixed(2)), y: Number(worldY.toFixed(2)) };
  };

  // Canvas Mouse Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle click or Alt+click pans
      setIsPanning(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    const { x, y } = screenToWorld(e.clientX, e.clientY);

    if (tool === 'add_wall') {
      if (!wallStart) {
        setWallStart({ x, y });
      } else {
        // Complete new wall
        const newWall: Wall = {
          id: `w_${Date.now()}`,
          x1: wallStart.x,
          y1: wallStart.y,
          x2: x,
          y2: y,
          thickness: 0.2,
          type: 'interior',
        };
        const nextWalls = [...walls, newWall];
        setWalls(nextWalls);
        pushHistory(nextWalls, doors, rooms);
        setWallStart(null);
      }
    } else if (tool === 'add_door') {
      const newDoor: Door = {
        id: `d_${Date.now()}`,
        x,
        y,
        width: 0.9,
        rotation: 0,
        label: `Door ${doors.length + 1}`,
      };
      const nextDoors = [...doors, newDoor];
      setDoors(nextDoors);
      pushHistory(walls, nextDoors, rooms);
      setSelectedId(newDoor.id);
      setSelectedType('door');
    } else if (tool === 'add_room') {
      const newRoom: Room = {
        id: `r_${Date.now()}`,
        name: `Room ${rooms.length + 1}`,
        polygon: [
          [x - 1.5, y - 1.5],
          [x + 1.5, y - 1.5],
          [x + 1.5, y + 1.5],
          [x - 1.5, y + 1.5],
        ],
        color: '#16B8A6',
      };
      const nextRooms = [...rooms, newRoom];
      setRooms(nextRooms);
      pushHistory(walls, doors, nextRooms);
      setSelectedId(newRoom.id);
      setSelectedType('room');
    } else if (tool === 'select') {
      // Check if clicking outside any element
      if (e.target === svgRef.current || (e.target as HTMLElement).tagName === 'rect') {
        setSelectedId(null);
        setSelectedType(null);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    setZoom((prev) => Math.min(Math.max(prev * factor, 10), 120));
  };

  const handleFitToView = () => {
    setZoom(35);
    setPan({ x: 350, y: 300 });
  };

  // Delete Selected Element
  const handleDeleteSelected = () => {
    if (!selectedId) return;
    if (selectedType === 'wall') {
      const next = walls.filter((w) => w.id !== selectedId);
      setWalls(next);
      pushHistory(next, doors, rooms);
    } else if (selectedType === 'door') {
      const next = doors.filter((d) => d.id !== selectedId);
      setDoors(next);
      pushHistory(walls, next, rooms);
    } else if (selectedType === 'room') {
      const next = rooms.filter((r) => r.id !== selectedId);
      setRooms(next);
      pushHistory(walls, doors, next);
    }
    setSelectedId(null);
    setSelectedType(null);
  };

  // Save changes to backend
  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await api.patch(`/projects/${projectId}/map`, {
        revision_name: `Manual Edit v${versionNumber + 1}`,
        walls,
        doors,
        rooms,
        is_preliminary: false,
        uncertainty_notes: 'User-validated floor plan layout.',
      });
      setVersionNumber(res.data.version_number);
      setRevisionName(res.data.revision_name);
      setIsPreliminary(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert('Save failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  // Selected item reference
  const selectedWall = selectedType === 'wall' ? walls.find((w) => w.id === selectedId) : null;
  const selectedDoor = selectedType === 'door' ? doors.find((d) => d.id === selectedId) : null;
  const selectedRoom = selectedType === 'room' ? rooms.find((r) => r.id === selectedId) : null;

  if (loading) {
    return (
      <Box sx={{ minHeight: 'calc(100vh - 68px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress sx={{ color: '#16B8A6' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 6, maxWidth: 600, mx: 'auto', textAlign: 'center' }}>
        <Alert severity="warning" sx={{ mb: 3 }}>{error}</Alert>
        <Button variant="contained" onClick={() => navigate(`/projects/${projectId}/upload`)} sx={{ backgroundColor: '#14243A' }}>
          Upload Video to Start Reconstruction
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ height: 'calc(100vh - 68px)', display: 'flex', flexDirection: 'column', backgroundColor: '#F8FAFC' }}>
      
      {/* Top Application Bar */}
      <Box sx={{ height: 56, px: 3, backgroundColor: '#FFFFFF', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        
        {/* Project & Revision Info */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#14243A' }}>
            {projectName}
          </Typography>
          <Chip
            size="small"
            label={`${revisionName} (v${versionNumber})`}
            sx={{ backgroundColor: isPreliminary ? '#FEF3C7' : '#E0F2FE', color: isPreliminary ? '#B45309' : '#0369A1', fontWeight: 600 }}
          />
          {isPreliminary && (
            <Tooltip title="Preliminary geometry reconstructed from monocular video. Adjust walls to refine dimensions.">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#D97706', fontSize: '0.8rem', cursor: 'help' }}>
                <AlertTriangle size={15} />
                <span>Preliminary AI Estimate</span>
              </Box>
            </Tooltip>
          )}
        </Box>

        {/* Global Action Buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {saveSuccess && (
            <Chip size="small" icon={<Check size={14} color="#15803D" />} label="Revision Saved" sx={{ backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 600 }} />
          )}

          <Button
            size="small"
            variant="outlined"
            startIcon={<RotateCcw size={15} />}
            onClick={loadMapData}
            sx={{ color: '#64748B', borderColor: '#CBD5E1' }}
          >
            Discard
          </Button>

          <Button
            size="small"
            variant="contained"
            disabled={saving}
            startIcon={<Save size={15} />}
            onClick={handleSave}
            sx={{ backgroundColor: '#16B8A6', fontWeight: 700, '&:hover': { backgroundColor: '#0F766E' } }}
          >
            {saving ? 'Saving...' : 'Save Revision'}
          </Button>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          <Button
            size="small"
            variant="outlined"
            startIcon={<CubeIcon size={15} />}
            onClick={() => navigate(`/projects/${projectId}/3d`)}
            sx={{ borderColor: '#CBD5E1', color: '#14243A', fontWeight: 600 }}
          >
            3D View
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Download size={15} />}
            onClick={() => navigate(`/projects/${projectId}/export`)}
            sx={{ borderColor: '#CBD5E1', color: '#14243A', fontWeight: 600 }}
          >
            Export
          </Button>
        </Box>
      </Box>

      {/* Main Workspace: Toolbar + SVG Canvas + Properties Panel */}
      <Box sx={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        
        {/* Floating Toolbar */}
        <Box
          sx={{
            position: 'absolute',
            top: 16,
            left: 16,
            zIndex: 10,
            backgroundColor: '#FFFFFF',
            borderRadius: 2.5,
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            border: '1px solid #E2E8F0',
            p: 0.8,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
          }}
        >
          <Tooltip title="Select & Inspect (V)" placement="right">
            <IconButton
              size="small"
              onClick={() => { setTool('select'); setWallStart(null); }}
              sx={{ backgroundColor: tool === 'select' ? '#14243A' : 'transparent', color: tool === 'select' ? '#FFFFFF' : '#64748B', '&:hover': { backgroundColor: tool === 'select' ? '#14243A' : '#F1F5F9' } }}
            >
              <MousePointer size={18} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Draw Wall (W)" placement="right">
            <IconButton
              size="small"
              onClick={() => { setTool('add_wall'); setSelectedId(null); }}
              sx={{ backgroundColor: tool === 'add_wall' ? '#16B8A6' : 'transparent', color: tool === 'add_wall' ? '#FFFFFF' : '#64748B', '&:hover': { backgroundColor: tool === 'add_wall' ? '#16B8A6' : '#F1F5F9' } }}
            >
              <Plus size={18} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Add Doorway (D)" placement="right">
            <IconButton
              size="small"
              onClick={() => { setTool('add_door'); setSelectedId(null); setWallStart(null); }}
              sx={{ backgroundColor: tool === 'add_door' ? '#16B8A6' : 'transparent', color: tool === 'add_door' ? '#FFFFFF' : '#64748B', '&:hover': { backgroundColor: tool === 'add_door' ? '#16B8A6' : '#F1F5F9' } }}
            >
              <DoorOpen size={18} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Add Room Label (R)" placement="right">
            <IconButton
              size="small"
              onClick={() => { setTool('add_room'); setSelectedId(null); setWallStart(null); }}
              sx={{ backgroundColor: tool === 'add_room' ? '#16B8A6' : 'transparent', color: tool === 'add_room' ? '#FFFFFF' : '#64748B', '&:hover': { backgroundColor: tool === 'add_room' ? '#16B8A6' : '#F1F5F9' } }}
            >
              <Tag size={18} />
            </IconButton>
          </Tooltip>

          <Divider sx={{ my: 0.5 }} />

          <Tooltip title="Delete Selected Element" placement="right">
            <span>
              <IconButton
                size="small"
                disabled={!selectedId}
                onClick={handleDeleteSelected}
                sx={{ color: selectedId ? '#EF4444' : '#CBD5E1' }}
              >
                <Trash2 size={18} />
              </IconButton>
            </span>
          </Tooltip>

          <Divider sx={{ my: 0.5 }} />

          <Tooltip title="Undo" placement="right">
            <span>
              <IconButton size="small" disabled={historyIdx <= 0} onClick={handleUndo}>
                <Undo2 size={16} />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title="Redo" placement="right">
            <span>
              <IconButton size="small" disabled={historyIdx >= history.length - 1} onClick={handleRedo}>
                <Redo2 size={16} />
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        {/* Floating View Controls (Bottom Left) */}
        <Box
          sx={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            zIndex: 10,
            backgroundColor: '#FFFFFF',
            borderRadius: 2,
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            border: '1px solid #E2E8F0',
            p: 0.6,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <Tooltip title="Zoom In">
            <IconButton size="small" onClick={() => setZoom((z) => Math.min(z * 1.2, 120))}>
              <ZoomIn size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zoom Out">
            <IconButton size="small" onClick={() => setZoom((z) => Math.max(z * 0.8, 10))}>
              <ZoomOut size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Reset View">
            <IconButton size="small" onClick={handleFitToView}>
              <Maximize2 size={16} />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          <Tooltip title="Toggle Grid Lines">
            <IconButton size="small" onClick={() => setShowGrid(!showGrid)} sx={{ color: showGrid ? '#16B8A6' : '#94A3B8' }}>
              <Grid size={16} />
            </IconButton>
          </Tooltip>

          <Button
            size="small"
            onClick={() => setSnapToGrid(!snapToGrid)}
            sx={{ fontSize: '0.75rem', fontWeight: 600, color: snapToGrid ? '#16B8A6' : '#94A3B8', px: 1 }}
          >
            Snap: {snapToGrid ? '0.5m ON' : 'OFF'}
          </Button>
        </Box>

        {/* Central Interactive 2D Canvas */}
        <Box
          sx={{
            flex: 1,
            height: '100%',
            overflow: 'hidden',
            cursor: tool === 'add_wall' ? 'crosshair' : isPanning ? 'grabbing' : 'default',
            backgroundColor: '#F1F5F9',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
        >
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            style={{ display: 'block' }}
          >
            <defs>
              {/* Dynamic 1-meter and 5-meter grid pattern */}
              <pattern
                id="editor-grid"
                width={zoom}
                height={zoom}
                patternUnits="userSpaceOnUse"
                patternTransform={`translate(${pan.x}, ${pan.y})`}
              >
                <path d={`M ${zoom} 0 L 0 0 0 ${zoom}`} fill="none" stroke="#E2E8F0" strokeWidth="0.8" />
              </pattern>
            </defs>

            {/* Background Canvas */}
            <rect width="100%" height="100%" fill={showGrid ? 'url(#editor-grid)' : '#F8FAFC'} />

            {/* World Origin Coordinates Marker */}
            <g transform={`translate(${pan.x}, ${pan.y})`}>
              <circle cx="0" cy="0" r="4" fill="#94A3B8" opacity="0.6" />
              <line x1="-15" y1="0" x2="15" y2="0" stroke="#CBD5E1" strokeWidth="1" />
              <line x1="0" y1="-15" x2="0" y2="15" stroke="#CBD5E1" strokeWidth="1" />
            </g>

            {/* Interactive Geometry Layer */}
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              
              {/* Rooms Polygons */}
              {rooms.map((room) => {
                const pts = room.polygon.map((p) => `${p[0]},${p[1]}`).join(' ');
                const isSel = selectedId === room.id;
                const cx = room.polygon.reduce((sum, p) => sum + p[0], 0) / room.polygon.length;
                const cy = room.polygon.reduce((sum, p) => sum + p[1], 0) / room.polygon.length;

                return (
                  <g key={room.id} onClick={(e) => { e.stopPropagation(); setSelectedId(room.id); setSelectedType('room'); }}>
                    <polygon
                      points={pts}
                      fill={room.color || '#16B8A6'}
                      fillOpacity={isSel ? 0.28 : 0.15}
                      stroke={isSel ? '#16B8A6' : (room.color || '#16B8A6')}
                      strokeWidth={isSel ? 0.08 : 0.04}
                      strokeDasharray="0.1,0.1"
                      style={{ cursor: 'pointer' }}
                    />
                    <text
                      x={cx}
                      y={cy}
                      fontSize="0.45"
                      fontFamily="sans-serif"
                      fontWeight="bold"
                      fill="#14243A"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {room.name}
                    </text>
                  </g>
                );
              })}

              {/* Walls */}
              {walls.map((wall) => {
                const isSel = selectedId === wall.id;
                const strokeCol = isSel ? '#16B8A6' : (wall.type === 'exterior' ? '#14243A' : '#475569');
                const strokeW = isSel ? wall.thickness + 0.08 : wall.thickness;

                return (
                  <g
                    key={wall.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(wall.id);
                      setSelectedType('wall');
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <line
                      x1={wall.x1}
                      y1={wall.y1}
                      x2={wall.x2}
                      y2={wall.y2}
                      stroke={strokeCol}
                      strokeWidth={strokeW}
                      strokeLinecap="round"
                    />

                    {/* Selection Handles */}
                    {isSel && (
                      <>
                        <circle cx={wall.x1} cy={wall.y1} r="0.15" fill="#16B8A6" stroke="#FFFFFF" strokeWidth="0.04" />
                        <circle cx={wall.x2} cy={wall.y2} r="0.15" fill="#16B8A6" stroke="#FFFFFF" strokeWidth="0.04" />
                      </>
                    )}
                  </g>
                );
              })}

              {/* Doors */}
              {doors.map((door) => {
                const isSel = selectedId === door.id;
                const dw = door.width;

                return (
                  <g
                    key={door.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(door.id);
                      setSelectedType('door');
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Door Arc swing */}
                    <circle
                      cx={door.x}
                      cy={door.y}
                      r={dw / 2}
                      fill="none"
                      stroke={isSel ? '#14243A' : '#16B8A6'}
                      strokeWidth="0.05"
                      strokeDasharray="0.08,0.08"
                    />
                    {/* Door Leaf representation */}
                    <rect
                      x={door.x - 0.08}
                      y={door.y - dw / 2}
                      width="0.16"
                      height={dw}
                      fill={isSel ? '#14243A' : '#16B8A6'}
                      opacity="0.85"
                    />
                  </g>
                );
              })}

              {/* In-progress Wall Drawing Line */}
              {wallStart && (
                <line
                  x1={wallStart.x}
                  y1={wallStart.y}
                  x2={wallStart.x}
                  y2={wallStart.y}
                  stroke="#16B8A6"
                  strokeWidth="0.2"
                  strokeDasharray="0.2,0.2"
                />
              )}

            </g>
          </svg>
        </Box>

        {/* Right Properties Panel */}
        <Box
          sx={{
            width: 310,
            height: '100%',
            backgroundColor: '#FFFFFF',
            borderLeft: '1px solid #E2E8F0',
            p: 2.5,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            overflowY: 'auto',
          }}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#14243A', mb: 2, letterSpacing: 0.5 }}>
              ELEMENT PROPERTIES
            </Typography>

            {/* Selected Wall Inspector */}
            {selectedWall && (
              <Stack spacing={2.5}>
                <Box sx={{ p: 1.5, backgroundColor: '#F8FAFC', borderRadius: 2, border: '1px solid #E2E8F0' }}>
                  <Typography variant="caption" sx={{ color: '#64748B' }}>Wall Identifier</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#14243A' }}>{selectedWall.id}</Typography>
                </Box>

                <FormControl fullWidth size="small">
                  <InputLabel>Wall Type</InputLabel>
                  <Select
                    value={selectedWall.type}
                    label="Wall Type"
                    onChange={(e) => {
                      const next = walls.map((w) => w.id === selectedWall.id ? { ...w, type: e.target.value } : w);
                      setWalls(next);
                      pushHistory(next, doors, rooms);
                    }}
                  >
                    <MenuItem value="exterior">Exterior Perimeter (0.25m)</MenuItem>
                    <MenuItem value="interior">Interior Partition (0.15m)</MenuItem>
                    <MenuItem value="divider">Divider (0.10m)</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  fullWidth
                  size="small"
                  label="Thickness (meters)"
                  type="number"
                  inputProps={{ step: 0.05, min: 0.05, max: 0.8 }}
                  value={selectedWall.thickness}
                  onChange={(e) => {
                    const thick = parseFloat(e.target.value) || 0.15;
                    const next = walls.map((w) => w.id === selectedWall.id ? { ...w, thickness: thick } : w);
                    setWalls(next);
                    pushHistory(next, doors, rooms);
                  }}
                />

                <Box sx={{ p: 1.5, backgroundColor: '#F8FAFC', borderRadius: 2 }}>
                  <Typography variant="caption" sx={{ color: '#64748B', display: 'block' }}>Calculated Length</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 700, color: '#16B8A6' }}>
                    {Math.hypot(selectedWall.x2 - selectedWall.x1, selectedWall.y2 - selectedWall.y1).toFixed(2)} meters
                  </Typography>
                </Box>

                <Button
                  color="error"
                  variant="outlined"
                  size="small"
                  startIcon={<Trash2 size={16} />}
                  onClick={handleDeleteSelected}
                >
                  Delete Wall
                </Button>
              </Stack>
            )}

            {/* Selected Door Inspector */}
            {selectedDoor && (
              <Stack spacing={2.5}>
                <TextField
                  fullWidth
                  size="small"
                  label="Doorway Label"
                  value={selectedDoor.label}
                  onChange={(e) => {
                    const next = doors.map((d) => d.id === selectedDoor.id ? { ...d, label: e.target.value } : d);
                    setDoors(next);
                    pushHistory(walls, next, rooms);
                  }}
                />

                <TextField
                  fullWidth
                  size="small"
                  label="Opening Width (meters)"
                  type="number"
                  inputProps={{ step: 0.05, min: 0.5, max: 2.5 }}
                  value={selectedDoor.width}
                  onChange={(e) => {
                    const w = parseFloat(e.target.value) || 0.9;
                    const next = doors.map((d) => d.id === selectedDoor.id ? { ...d, width: w } : d);
                    setDoors(next);
                    pushHistory(walls, next, rooms);
                  }}
                />

                <Button
                  color="error"
                  variant="outlined"
                  size="small"
                  startIcon={<Trash2 size={16} />}
                  onClick={handleDeleteSelected}
                >
                  Delete Doorway
                </Button>
              </Stack>
            )}

            {/* Selected Room Inspector */}
            {selectedRoom && (
              <Stack spacing={2.5}>
                <TextField
                  fullWidth
                  size="small"
                  label="Room Name"
                  value={selectedRoom.name}
                  onChange={(e) => {
                    const next = rooms.map((r) => r.id === selectedRoom.id ? { ...r, name: e.target.value } : r);
                    setRooms(next);
                    pushHistory(walls, doors, next);
                  }}
                />

                <FormControl fullWidth size="small">
                  <InputLabel>Highlight Color</InputLabel>
                  <Select
                    value={selectedRoom.color || '#16B8A6'}
                    label="Highlight Color"
                    onChange={(e) => {
                      const next = rooms.map((r) => r.id === selectedRoom.id ? { ...r, color: e.target.value } : r);
                      setRooms(next);
                      pushHistory(walls, doors, next);
                    }}
                  >
                    <MenuItem value="#16B8A6">Teal Green</MenuItem>
                    <MenuItem value="#0284C7">Sky Blue</MenuItem>
                    <MenuItem value="#F59E0B">Amber Gold</MenuItem>
                    <MenuItem value="#8B5CF6">Purple Lavender</MenuItem>
                  </Select>
                </FormControl>

                <Button
                  color="error"
                  variant="outlined"
                  size="small"
                  startIcon={<Trash2 size={16} />}
                  onClick={handleDeleteSelected}
                >
                  Delete Room Label
                </Button>
              </Stack>
            )}

            {/* Empty State in Inspector */}
            {!selectedWall && !selectedDoor && !selectedRoom && (
              <Box sx={{ py: 6, textAlign: 'center', color: '#94A3B8' }}>
                <MousePointer size={28} style={{ margin: '0 auto 8px auto', display: 'block' }} />
                <Typography variant="body2" sx={{ color: '#64748B' }}>
                  Click any wall, doorway, or room label on the canvas to inspect and edit its geometric attributes.
                </Typography>
              </Box>
            )}
          </Box>

          {/* Quick Summary Box */}
          <Box sx={{ pt: 2, borderTop: '1px solid #F1F5F9' }}>
            <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', mb: 0.5 }}>
              LAYOUT METRICS
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748B', display: 'block' }}>
              &bull; Walls: {walls.length} segments
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748B', display: 'block' }}>
              &bull; Doors: {doors.length} openings
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748B', display: 'block' }}>
              &bull; Rooms: {rooms.length} zones
            </Typography>
          </Box>
        </Box>

      </Box>
    </Box>
  );
};
