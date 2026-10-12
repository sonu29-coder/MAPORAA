import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Button, Grid, Card, CardContent,
  Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText,
  DialogActions, CircularProgress, Stack, Tooltip
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  PlusCircle, Map, Trash2, Eye, Box as CubeIcon, Download,
  Clock, Video, AlertCircle, CheckCircle2, RefreshCw
} from 'lucide-react';

interface ProjectItem {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  videos: any[];
  latest_reconstruction?: {
    id: string;
    status: string;
    current_stage: number;
    progress: number;
    error_message?: string;
  };
}

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ProjectItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const res = await api.get('/projects');
      setProjects(res.data);
    } catch (err) {
      console.error('Failed to load projects', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await api.delete(`/projects/${deleteTarget.id}`);
      setProjects(projects.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to delete project', err);
    } finally {
      setDeleting(false);
    }
  };

  const getStatusBadge = (project: ProjectItem) => {
    const recon = project.latest_reconstruction;
    if (!recon) {
      if (project.videos && project.videos.length > 0) {
        return <Chip size="small" label="Video Uploaded" sx={{ backgroundColor: '#E0F2FE', color: '#0369A1', fontWeight: 600 }} />;
      }
      return <Chip size="small" label="No Video" sx={{ backgroundColor: '#F1F5F9', color: '#64748B', fontWeight: 600 }} />;
    }

    switch (recon.status) {
      case 'COMPLETED':
        return <Chip size="small" icon={<CheckCircle2 size={14} color="#10B981" />} label="Reconstructed" sx={{ backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 600 }} />;
      case 'RUNNING':
        return <Chip size="small" icon={<RefreshCw size={14} className="spin" color="#0284C7" />} label={`Processing (${recon.current_stage}/10)`} sx={{ backgroundColor: '#E0F2FE', color: '#0369A1', fontWeight: 600 }} />;
      case 'FAILED':
        return <Chip size="small" icon={<AlertCircle size={14} color="#EF4444" />} label="Failed" sx={{ backgroundColor: '#FEE2E2', color: '#B91C1C', fontWeight: 600 }} />;
      case 'PENDING':
        return <Chip size="small" label="Queued" sx={{ backgroundColor: '#FEF3C7', color: '#B45309', fontWeight: 600 }} />;
      default:
        return <Chip size="small" label={recon.status} />;
    }
  };

  return (
    <Box sx={{ minHeight: 'calc(100vh - 68px)', backgroundColor: '#F5F7FA', py: 5 }}>
      <Container maxWidth="lg">
        
        {/* Welcome Header */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, mb: 4 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#14243A' }}>
              Workspace Dashboard
            </Typography>
            <Typography variant="body1" sx={{ color: '#64748B', mt: 0.5 }}>
              Welcome back, <b style={{ color: '#14243A' }}>{user?.full_name || user?.email}</b>. Manage walkthrough recordings and generated maps.
            </Typography>
          </Box>

          <Button
            variant="contained"
            size="large"
            onClick={() => navigate('/projects/new')}
            startIcon={<PlusCircle size={18} />}
            sx={{
              backgroundColor: '#16B8A6',
              fontWeight: 700,
              px: 2.5,
              py: 1.2,
              '&:hover': { backgroundColor: '#0F766E' },
            }}
          >
            Create New Map
          </Button>
        </Box>

        {/* Content */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}>
            <CircularProgress sx={{ color: '#16B8A6' }} />
          </Box>
        ) : projects.length === 0 ? (
          /* Empty State */
          <Card sx={{ textAlign: 'center', py: 9, px: 3, border: '2px dashed #CBD5E1', backgroundColor: '#FFFFFF' }}>
            <Box sx={{ width: 60, height: 60, borderRadius: '50%', backgroundColor: 'rgba(22, 184, 166, 0.1)', color: '#16B8A6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
              <Map size={32} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#14243A', mb: 1 }}>
              No Reconstruction Projects Yet
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748B', maxWidth: 460, mx: 'auto', mb: 3 }}>
              Start by uploading an indoor video walkthrough. MAPORAA will extract frames, estimate poses, and generate preliminary 2D/3D geometry.
            </Typography>
            <Button
              variant="contained"
              onClick={() => navigate('/projects/new')}
              startIcon={<PlusCircle size={18} />}
              sx={{ backgroundColor: '#14243A', fontWeight: 600, px: 3, py: 1.2, '&:hover': { backgroundColor: '#23395B' } }}
            >
              Start First Map Project
            </Button>
          </Card>
        ) : (
          /* Projects Grid */
          <Grid container spacing={3}>
            {projects.map((project) => (
              <Grid item xs={12} md={6} lg={4} key={project.id}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      borderColor: '#16B8A6',
                      boxShadow: '0 8px 24px rgba(20, 36, 58, 0.08)',
                    },
                  }}
                >
                  <CardContent sx={{ pb: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: '#14243A', fontSize: '1.15rem' }}>
                        {project.name}
                      </Typography>
                      {getStatusBadge(project)}
                    </Box>

                    {project.description && (
                      <Typography variant="body2" sx={{ color: '#64748B', mb: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {project.description}
                      </Typography>
                    )}

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: '#94A3B8', fontSize: '0.8rem', mt: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Clock size={14} />
                        <span>{new Date(project.created_at).toLocaleDateString()}</span>
                      </Box>
                      {project.videos && project.videos.length > 0 && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#16B8A6' }}>
                          <Video size={14} />
                          <span>Video linked</span>
                        </Box>
                      )}
                    </Box>
                  </CardContent>

                  {/* Actions Bar */}
                  <Box sx={{ p: 2, pt: 1, borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Stack direction="row" spacing={1}>
                      {project.latest_reconstruction?.status === 'COMPLETED' ? (
                        <>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<Map size={15} />}
                            onClick={() => navigate(`/projects/${project.id}/map`)}
                            sx={{ borderColor: '#CBD5E1', color: '#14243A', fontWeight: 600, fontSize: '0.8rem' }}
                          >
                            2D Map
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<CubeIcon size={15} />}
                            onClick={() => navigate(`/projects/${project.id}/3d`)}
                            sx={{ borderColor: '#CBD5E1', color: '#14243A', fontWeight: 600, fontSize: '0.8rem' }}
                          >
                            3D Model
                          </Button>
                          <Tooltip title="Export formats">
                            <IconButton
                              size="small"
                              onClick={() => navigate(`/projects/${project.id}/export`)}
                              sx={{ color: '#16B8A6' }}
                            >
                              <Download size={17} />
                            </IconButton>
                          </Tooltip>
                        </>
                      ) : project.latest_reconstruction?.status === 'RUNNING' ? (
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => navigate(`/projects/${project.id}/processing`)}
                          sx={{ backgroundColor: '#0284C7', color: '#FFFFFF', fontWeight: 600, fontSize: '0.8rem' }}
                        >
                          View Progress
                        </Button>
                      ) : (
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => navigate(`/projects/${project.id}/upload`)}
                          sx={{ backgroundColor: '#14243A', color: '#FFFFFF', fontWeight: 600, fontSize: '0.8rem' }}
                        >
                          Upload & Process
                        </Button>
                      )}
                    </Stack>

                    <Tooltip title="Delete Project">
                      <IconButton
                        size="small"
                        onClick={() => setDeleteTarget(project)}
                        sx={{ color: '#94A3B8', '&:hover': { color: '#EF4444' } }}
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}

        {/* Delete Confirmation Modal */}
        <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
          <DialogTitle sx={{ fontWeight: 700, color: '#14243A' }}>
            Delete Project?
          </DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ color: '#64748B' }}>
              Are you sure you want to delete <b>{deleteTarget?.name}</b>? All uploaded videos, reconstructed floor plans, and 3D artifacts associated with this project will be permanently removed.
            </DialogContentText>
          </DialogContent>
          <DialogActions sx={{ p: 2, pt: 0 }}>
            <Button onClick={() => setDeleteTarget(null)} disabled={deleting} sx={{ color: '#64748B' }}>
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={deleting}
              variant="contained"
              sx={{ backgroundColor: '#EF4444', color: '#FFFFFF', '&:hover': { backgroundColor: '#DC2626' } }}
            >
              {deleting ? <CircularProgress size={20} sx={{ color: '#FFFFFF' }} /> : 'Confirm Delete'}
            </Button>
          </DialogActions>
        </Dialog>

      </Container>
    </Box>
  );
};
