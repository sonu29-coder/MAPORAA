import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Grid, Card, CardContent,
  Button, Chip, Alert, CircularProgress, Stack, Divider
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  Download, FileText, Image, Box as CubeIcon, Code,
  CheckCircle2, Map, ArrowLeft, AlertCircle
} from 'lucide-react';

export const ExportPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [hasMap, setHasMap] = useState(false);
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);

  useEffect(() => {
    const checkProject = async () => {
      try {
        setLoading(true);
        const pRes = await api.get(`/projects/${projectId}`);
        setProjectName(pRes.data.name);

        const mRes = await api.get(`/projects/${projectId}/map`);
        if (mRes.data && mRes.data.walls && mRes.data.walls.length > 0) {
          setHasMap(true);
        } else {
          setHasMap(false);
        }
      } catch (err: any) {
        setError('No reconstruction geometry found for this project yet. Complete a reconstruction first.');
      } finally {
        setLoading(false);
      }
    };

    checkProject();
  }, [projectId]);

  const handleExport = async (format: string, ext: string) => {
    setDownloadingFormat(format);
    try {
      // 1. Trigger export generation on backend
      const res = await api.post(`/projects/${projectId}/exports`, { format });
      const exportId = res.data.id;
      const filename = res.data.filename || `maporaa_${format.toLowerCase()}.${ext}`;

      // 2. Download authorized file stream
      const fileRes = await api.get(`/exports/${exportId}/download`, {
        responseType: 'blob',
      });

      // 3. Trigger browser download
      const blob = new Blob([fileRes.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setDownloadingFormat(null);
    }
  };

  const formats = [
    {
      format: 'SVG',
      ext: 'svg',
      title: 'SVG Vector Floor Plan',
      icon: <Image size={28} color="#16B8A6" />,
      badge: 'Vector Graphics',
      desc: 'High-resolution scalable vector drawing containing all exterior walls, partition lines, doors, and room labels. Ideal for web, Adobe Illustrator, and Figma.',
    },
    {
      format: 'PDF',
      ext: 'pdf',
      title: 'PDF Architectural Report',
      icon: <FileText size={28} color="#EF4444" />,
      badge: 'Formal Report',
      desc: 'A comprehensive multi-page formatted document generated via ReportLab with project metadata, visual layout canvas, room breakdown tables, and reconstruction limitations.',
    },
    {
      format: 'OBJ',
      ext: 'obj',
      title: 'OBJ 3D Model Mesh',
      icon: <CubeIcon size={28} color="#3B82F6" />,
      badge: '3D Geometry',
      desc: 'Standard Wavefront 3D geometry file containing extruded walls, floor polygons, and mesh facets. Compatible with Blender, AutoCAD, and Three.js.',
    },
    {
      format: 'JSON',
      ext: 'json',
      title: 'JSON Geometry Schema',
      icon: <Code size={28} color="#10B981" />,
      badge: 'Raw Data',
      desc: 'Complete machine-readable coordinate specification of all walls, doorways, rooms, and navigation waypoints with calibrated coordinates in meters.',
    },
  ];

  if (loading) {
    return (
      <Box sx={{ minHeight: 'calc(100vh - 68px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress sx={{ color: '#16B8A6' }} />
      </Box>
    );
  }

  if (error || !hasMap) {
    return (
      <Container maxWidth="md" sx={{ py: 8, textAlign: 'center' }}>
        <Alert severity="warning" sx={{ mb: 3 }}>
          {error || 'No reconstructed map geometry available yet. Complete a reconstruction before exporting files.'}
        </Alert>
        <Button
          variant="contained"
          onClick={() => navigate(`/projects/${projectId}/upload`)}
          sx={{ backgroundColor: '#14243A' }}
        >
          Go to Video Upload
        </Button>
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: 'calc(100vh - 68px)', backgroundColor: '#F5F7FA', py: 6 }}>
      <Container maxWidth="lg">
        
        {/* Navigation & Header */}
        <Box sx={{ mb: 4 }}>
          <Button
            startIcon={<ArrowLeft size={16} />}
            onClick={() => navigate(`/projects/${projectId}/map`)}
            sx={{ color: '#64748B', mb: 2 }}
          >
            Back to 2D Map Editor
          </Button>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 800, color: '#14243A' }}>
                Export Reconstruction Files
              </Typography>
              <Typography variant="body1" sx={{ color: '#64748B', mt: 0.5 }}>
                Download genuine architectural and geometric files generated for <b>{projectName}</b>.
              </Typography>
            </Box>
            <Chip
              label="Verified Reconstruction Ready"
              sx={{ backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 600, py: 2 }}
            />
          </Box>
        </Box>

        {/* Formats Grid */}
        <Grid container spacing={3} sx={{ mb: 5 }}>
          {formats.map((item) => (
            <Grid item xs={12} md={6} key={item.format}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  p: 1.5,
                  transition: 'all 0.2s',
                  '&:hover': {
                    borderColor: '#16B8A6',
                    boxShadow: '0 6px 20px rgba(20, 36, 58, 0.08)',
                  },
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box sx={{ p: 1.5, borderRadius: 2, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      {item.icon}
                    </Box>
                    <Chip size="small" label={item.badge} sx={{ fontWeight: 600, backgroundColor: '#F1F5F9' }} />
                  </Box>

                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#14243A', mb: 1 }}>
                    {item.title}
                  </Typography>

                  <Typography variant="body2" sx={{ color: '#64748B', lineHeight: 1.6 }}>
                    {item.desc}
                  </Typography>
                </CardContent>

                <Box sx={{ p: 2, pt: 0 }}>
                  <Button
                    fullWidth
                    variant="contained"
                    disabled={downloadingFormat === item.format}
                    onClick={() => handleExport(item.format, item.ext)}
                    startIcon={
                      downloadingFormat === item.format ? (
                        <CircularProgress size={16} sx={{ color: '#FFFFFF' }} />
                      ) : (
                        <Download size={16} />
                      )
                    }
                    sx={{
                      backgroundColor: '#14243A',
                      py: 1.2,
                      fontWeight: 700,
                      '&:hover': { backgroundColor: '#23395B' },
                    }}
                  >
                    {downloadingFormat === item.format ? `Generating ${item.format}...` : `Generate & Download .${item.ext}`}
                  </Button>
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* DXF & CAD Dependency Disclosure */}
        <Card sx={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', p: 1 }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#14243A', mb: 0.5 }}>
              CAD & DXF Compatibility Note
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748B', lineHeight: 1.6 }}>
              Direct DXF file export requires specialized native CAD libraries (such as ezdxf). The provided <b>SVG vector</b> and <b>OBJ 3D</b> formats can be directly imported into AutoCAD, LibreCAD, Revit, or SketchUp for full DXF conversion.
            </Typography>
          </CardContent>
        </Card>

      </Container>
    </Box>
  );
};
