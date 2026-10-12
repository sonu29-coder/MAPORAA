import React, { useEffect, useRef, useState } from 'react';
import {
  Box, Typography, Button, IconButton, Tooltip, Card,
  Chip, CircularProgress, Alert, Stack
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import api from '../services/api';
import {
  RotateCcw, Eye, Layers, Grid, Map, Download,
  Maximize2, Box as CubeIcon, Compass, Sparkles
} from 'lucide-react';

export const ModelViewer3D: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const mountRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('3D Scene');

  // Visualization toggles
  const [showWalls, setShowWalls] = useState(true);
  const [showFloor, setShowFloor] = useState(true);
  const [showPointCloud, setShowPointCloud] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  // References for Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const wallsGroupRef = useRef<THREE.Group>(new THREE.Group());
  const floorGroupRef = useRef<THREE.Group>(new THREE.Group());
  const pointCloudGroupRef = useRef<THREE.Group>(new THREE.Group());
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const axesHelperRef = useRef<THREE.AxesHelper | null>(null);

  // Camera Orbit State
  const isDraggingRef = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const sphericalRef = useRef({ radius: 20, theta: Math.PI / 4, phi: Math.PI / 3 });
  const targetRef = useRef(new THREE.Vector3(0, 0, 0));

  const updateCameraPosition = () => {
    if (!cameraRef.current) return;
    const s = sphericalRef.current;
    const t = targetRef.current;

    cameraRef.current.position.x = t.x + s.radius * Math.sin(s.phi) * Math.sin(s.theta);
    cameraRef.current.position.y = t.y + s.radius * Math.cos(s.phi);
    cameraRef.current.position.z = t.z + s.radius * Math.sin(s.phi) * Math.cos(s.theta);
    cameraRef.current.lookAt(t);
  };

  const handleResetCamera = () => {
    sphericalRef.current = { radius: 22, theta: Math.PI / 4, phi: Math.PI / 3 };
    targetRef.current.set(0, 0, 0);
    updateCameraPosition();
  };

  useEffect(() => {
    let animationFrameId: number;

    const initThreeScene = async () => {
      try {
        setLoading(true);
        setError(null);

        const pRes = await api.get(`/projects/${projectId}`);
        setProjectName(pRes.data.name);

        const mapRes = await api.get(`/projects/${projectId}/map`);
        const { walls, rooms, bounds } = mapRes.data;

        if (!mountRef.current) return;
        const width = mountRef.current.clientWidth;
        const height = mountRef.current.clientHeight;

        // 1. Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#0F172A'); // deep navy background
        sceneRef.current = scene;

        // 2. Camera
        const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
        cameraRef.current = camera;
        updateCameraPosition();

        // 3. Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        rendererRef.current = renderer;

        mountRef.current.innerHTML = '';
        mountRef.current.appendChild(renderer.domElement);

        // 4. Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(15, 25, 15);
        dirLight.castShadow = true;
        scene.add(dirLight);

        const fillLight = new THREE.DirectionalLight(0x16b8a6, 0.3); // teal fill light
        fillLight.position.set(-15, 10, -15);
        scene.add(fillLight);

        // 5. Grid & Axes Helper
        const grid = new THREE.GridHelper(30, 30, 0x16b8a6, 0x334155);
        grid.position.y = 0;
        gridHelperRef.current = grid;
        scene.add(grid);

        const axes = new THREE.AxesHelper(3);
        axes.position.set(0, 0.05, 0);
        axesHelperRef.current = axes;
        scene.add(axes);

        // 6. Extrude 3D Walls from Actual Backend Geometry
        const wallsGroup = wallsGroupRef.current;
        wallsGroup.clear();

        const wallHeight = 2.6;
        const wallMat = new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          roughness: 0.35,
          metalness: 0.1,
        });
        const wallTopMat = new THREE.MeshStandardMaterial({
          color: 0x16b8a6, // Teal accent on wall tops
          roughness: 0.2,
        });

        // Compute centroid to center the model
        const minX = bounds.minX ?? -5;
        const maxX = bounds.maxX ?? 5;
        const minY = bounds.minY ?? -5;
        const maxY = bounds.maxY ?? 5;
        const centerX = (minX + maxX) / 2;
        const centerZ = (minY + maxY) / 2;
        targetRef.current.set(0, wallHeight / 2, 0);

        (walls || []).forEach((w: any) => {
          const x1 = w.x1 - centerX;
          const z1 = w.y1 - centerZ;
          const x2 = w.x2 - centerX;
          const z2 = w.y2 - centerZ;

          const dx = x2 - x1;
          const dz = z2 - z1;
          const length = Math.hypot(dx, dz);
          const angle = Math.atan2(dz, dx);
          const thickness = w.thickness || 0.2;

          const boxGeo = new THREE.BoxGeometry(length, wallHeight, thickness);
          const boxMesh = new THREE.Mesh(boxGeo, wallMat);

          boxMesh.position.x = (x1 + x2) / 2;
          boxMesh.position.y = wallHeight / 2;
          boxMesh.position.z = (z1 + z2) / 2;
          boxMesh.rotation.y = -angle;
          boxMesh.castShadow = true;
          boxMesh.receiveShadow = true;

          // Subtle top border wireframe
          const edgeGeo = new THREE.EdgesGeometry(boxGeo);
          const edgeLine = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0x38d9c5 }));
          boxMesh.add(edgeLine);

          wallsGroup.add(boxMesh);
        });
        scene.add(wallsGroup);

        // 7. Floor Slab Mesh
        const floorGroup = floorGroupRef.current;
        floorGroup.clear();

        const floorW = Math.max(8, (maxX - minX) + 2);
        const floorH = Math.max(8, (maxY - minY) + 2);
        const floorGeo = new THREE.PlaneGeometry(floorW, floorH);
        const floorMat = new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          roughness: 0.8,
          metalness: 0.1,
        });
        const floorMesh = new THREE.Mesh(floorGeo, floorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.y = -0.02;
        floorMesh.receiveShadow = true;
        floorGroup.add(floorMesh);
        scene.add(floorGroup);

        // 8. 3D Point Cloud Representation
        const pointCloudGroup = pointCloudGroupRef.current;
        pointCloudGroup.clear();

        const pointCoords: number[] = [];
        const pointColors: number[] = [];

        // Sample points along reconstructed walls
        (walls || []).forEach((w: any) => {
          const x1 = w.x1 - centerX;
          const z1 = w.y1 - centerZ;
          const x2 = w.x2 - centerX;
          const z2 = w.y2 - centerZ;

          const count = 30;
          for (let i = 0; i <= count; i++) {
            const t = i / count;
            const px = x1 + (x2 - x1) * t + (Math.random() - 0.5) * 0.15;
            const pz = z1 + (z2 - z1) * t + (Math.random() - 0.5) * 0.15;
            for (let h = 0.2; h <= wallHeight; h += 0.4) {
              const py = h + (Math.random() - 0.5) * 0.1;
              pointCoords.push(px, py, pz);
              // Teal-cyan gradient
              pointColors.push(0.08, 0.72, 0.65);
            }
          }
        });

        if (pointCoords.length > 0) {
          const pointsGeo = new THREE.BufferGeometry();
          pointsGeo.setAttribute('position', new THREE.Float32BufferAttribute(pointCoords, 3));
          pointsGeo.setAttribute('color', new THREE.Float32BufferAttribute(pointColors, 3));

          const pointsMat = new THREE.PointsMaterial({
            size: 0.08,
            vertexColors: true,
            transparent: true,
            opacity: 0.85,
          });
          const pointsMesh = new THREE.Points(pointsGeo, pointsMat);
          pointCloudGroup.add(pointsMesh);
        }
        scene.add(pointCloudGroup);

        // Update initial camera perspective
        updateCameraPosition();

        // Render Loop
        const animate = () => {
          animationFrameId = requestAnimationFrame(animate);
          renderer.render(scene, camera);
        };
        animate();

      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load 3D reconstruction.');
      } finally {
        setLoading(false);
      }
    };

    initThreeScene();

    // Resize handler
    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (rendererRef.current && rendererRef.current.domElement) {
        rendererRef.current.dispose();
      }
    };
  }, [projectId]);

  // Orbit Drag Controls Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    previousMousePosition.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - previousMousePosition.current.x;
    const deltaY = e.clientY - previousMousePosition.current.y;

    sphericalRef.current.theta -= deltaX * 0.008;
    sphericalRef.current.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, sphericalRef.current.phi - deltaY * 0.008));

    updateCameraPosition();
    previousMousePosition.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    sphericalRef.current.radius = Math.max(5, Math.min(60, sphericalRef.current.radius + e.deltaY * 0.03));
    updateCameraPosition();
  };

  // Toggle Visibility Effects
  useEffect(() => {
    wallsGroupRef.current.visible = showWalls;
  }, [showWalls]);

  useEffect(() => {
    floorGroupRef.current.visible = showFloor;
  }, [showFloor]);

  useEffect(() => {
    pointCloudGroupRef.current.visible = showPointCloud;
  }, [showPointCloud]);

  useEffect(() => {
    if (gridHelperRef.current) gridHelperRef.current.visible = showGrid;
    if (axesHelperRef.current) axesHelperRef.current.visible = showGrid;
  }, [showGrid]);

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
          Upload Video to Reconstruct 3D Model
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ height: 'calc(100vh - 68px)', display: 'flex', flexDirection: 'column', backgroundColor: '#0F172A', position: 'relative' }}>
      
      {/* Top Header Bar */}
      <Box sx={{ height: 56, px: 3, backgroundColor: '#14243A', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#FFFFFF' }}>
            {projectName} &bull; 3D Model Inspector
          </Typography>
          <Chip
            size="small"
            label="Monocular Depth Model"
            sx={{ backgroundColor: 'rgba(22, 184, 166, 0.2)', color: '#16B8A6', fontWeight: 600 }}
          />
        </Box>

        <Stack direction="row" spacing={1.5}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Map size={15} />}
            onClick={() => navigate(`/projects/${projectId}/map`)}
            sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#FFFFFF', fontWeight: 600 }}
          >
            2D Map Editor
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<Download size={15} />}
            onClick={() => navigate(`/projects/${projectId}/export`)}
            sx={{ backgroundColor: '#16B8A6', color: '#FFFFFF', fontWeight: 700, '&:hover': { backgroundColor: '#0F766E' } }}
          >
            Export Formats
          </Button>
        </Stack>
      </Box>

      {/* Floating Control Toolbar (Top Left) */}
      <Box
        sx={{
          position: 'absolute',
          top: 72,
          left: 20,
          zIndex: 10,
          backgroundColor: 'rgba(20, 36, 58, 0.85)',
          backdropFilter: 'blur(8px)',
          borderRadius: 2,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          p: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.8,
        }}
      >
        <Tooltip title="Reset Camera Angle" placement="right">
          <IconButton size="small" onClick={handleResetCamera} sx={{ color: '#FFFFFF' }}>
            <RotateCcw size={16} />
          </IconButton>
        </Tooltip>

        <Tooltip title="Toggle 3D Walls" placement="right">
          <IconButton size="small" onClick={() => setShowWalls(!showWalls)} sx={{ color: showWalls ? '#16B8A6' : '#64748B' }}>
            <CubeIcon size={16} />
          </IconButton>
        </Tooltip>

        <Tooltip title="Toggle Floor Slab" placement="right">
          <IconButton size="small" onClick={() => setShowFloor(!showFloor)} sx={{ color: showFloor ? '#16B8A6' : '#64748B' }}>
            <Layers size={16} />
          </IconButton>
        </Tooltip>

        <Tooltip title="Toggle Point Cloud" placement="right">
          <IconButton size="small" onClick={() => setShowPointCloud(!showPointCloud)} sx={{ color: showPointCloud ? '#16B8A6' : '#64748B' }}>
            <Sparkles size={16} />
          </IconButton>
        </Tooltip>

        <Tooltip title="Toggle Grid & Axes" placement="right">
          <IconButton size="small" onClick={() => setShowGrid(!showGrid)} sx={{ color: showGrid ? '#16B8A6' : '#64748B' }}>
            <Grid size={16} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Camera Guidance Notice (Bottom Right) */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 20,
          right: 20,
          zIndex: 10,
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(6px)',
          borderRadius: 2,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          px: 2,
          py: 1.2,
          color: '#94A3B8',
          fontSize: '0.8rem',
        }}
      >
        <Typography variant="caption" sx={{ display: 'block', color: '#F1F5F9', fontWeight: 600 }}>
          3D Orbit Navigation:
        </Typography>
        <span>&bull; Left Drag: Orbit Camera</span><br />
        <span>&bull; Scroll: Zoom In / Out</span>
      </Box>

      {/* Three.js Canvas Container */}
      <Box
        ref={mountRef}
        sx={{
          flex: 1,
          width: '100%',
          height: '100%',
          cursor: 'grab',
          '&:active': { cursor: 'grabbing' },
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      />
    </Box>
  );
};
