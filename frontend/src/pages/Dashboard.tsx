import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Button, Grid, Card, CardContent,
  Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText,
  DialogActions, CircularProgress, Stack, Tooltip, Tabs, Tab,
  TextField, MenuItem, Select, FormControl, InputLabel, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Switch, Alert
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  PlusCircle, Map, Trash2, Eye, Box as CubeIcon, Download,
  Clock, Video, AlertCircle, CheckCircle2, RefreshCw, Edit3,
  Shield, Users, FolderGit2, Check, XCircle
} from 'lucide-react';

interface ProjectItem {
  id: string;
  name: string;
  description?: string;
  status?: string;
  owner_email?: string;
  map_versions_count?: number;
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

interface AdminUser {
  id: string;
  email: string;
  full_name?: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Tab state: 'projects' or 'admin'
  const [activeTab, setActiveTab] = useState<'projects' | 'admin'>('projects');
  
  // Status filter state
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Projects state
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit Project dialog state
  const [editTarget, setEditTarget] = useState<ProjectItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStatus, setEditStatus] = useState('ACTIVE');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<ProjectItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Admin view state
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminProjects, setAdminProjects] = useState<ProjectItem[]>([]);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [adminActionError, setAdminActionError] = useState<string | null>(null);

  const fetchProjects = async (filter: string = statusFilter) => {
    try {
      setLoading(true);
      const url = filter === 'ALL' ? '/projects' : `/projects?status=${filter}`;
      const res = await api.get(url);
      setProjects(res.data);
    } catch (err) {
      console.error('Failed to load projects', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminData = async () => {
    if (user?.role !== 'admin') return;
    try {
      setLoadingAdmin(true);
      setAdminActionError(null);
      const [uRes, pRes] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/projects')
      ]);
      setAdminUsers(uRes.data);
      setAdminProjects(pRes.data);
    } catch (err: any) {
      setAdminActionError(err.response?.data?.detail || 'Failed to fetch admin data.');
    } finally {
      setLoadingAdmin(false);
    }
  };

  useEffect(() => {
    fetchProjects(statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    if (activeTab === 'admin') {
      fetchAdminData();
    }
  }, [activeTab]);

  const handleOpenEdit = (project: ProjectItem) => {
    setEditTarget(project);
    setEditName(project.name);
    setEditDesc(project.description || '');
    setEditStatus(project.status || 'ACTIVE');
  };

  const handleSaveEdit = async () => {
    if (!editTarget || !editName.trim()) return;
    try {
      setSavingEdit(true);
      const res = await api.patch(`/projects/${editTarget.id}`, {
        name: editName.trim(),
        description: editDesc.trim(),
        status: editStatus
      });
      setProjects((prev) => prev.map((p) => (p.id === editTarget.id ? { ...p, ...res.data } : p)));
      setEditTarget(null);
    } catch (err) {
      console.error('Failed to update project', err);
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      if (user?.role === 'admin' && activeTab === 'admin') {
        await api.delete(`/admin/projects/${deleteTarget.id}`);
        setAdminProjects(adminProjects.filter((p) => p.id !== deleteTarget.id));
      } else {
        await api.delete(`/projects/${deleteTarget.id}`);
        setProjects(projects.filter((p) => p.id !== deleteTarget.id));
      }
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to delete project', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleUserActive = async (targetUser: AdminUser) => {
    try {
      const res = await api.patch(`/admin/users/${targetUser.id}`, {
        is_active: !targetUser.is_active
      });
      setAdminUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, is_active: res.data.is_active } : u))
      );
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update user status.');
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

  const getProjectLifecycleBadge = (status?: string) => {
    switch (status) {
      case 'ARCHIVED':
        return <Chip size="small" label="ARCHIVED" sx={{ backgroundColor: '#E2E8F0', color: '#475569', fontWeight: 700, fontSize: '0.7rem' }} />;
      case 'COMPLETED':
        return <Chip size="small" label="COMPLETED" sx={{ backgroundColor: '#DCFCE7', color: '#166534', fontWeight: 700, fontSize: '0.7rem' }} />;
      default:
        return <Chip size="small" label="ACTIVE" sx={{ backgroundColor: '#CCFBF1', color: '#0F766E', fontWeight: 700, fontSize: '0.7rem' }} />;
    }
  };

  return (
    <Box sx={{ minHeight: 'calc(100vh - 68px)', backgroundColor: '#F5F7FA', py: 5 }}>
      <Container maxWidth="lg">
        
        {/* Welcome Header */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, mb: 3 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#14243A' }}>
              Workspace Dashboard
            </Typography>
            <Typography variant="body1" sx={{ color: '#64748B', mt: 0.5 }}>
              Welcome back, <b style={{ color: '#14243A' }}>{user?.full_name || user?.email}</b>. Role: <b style={{ color: '#16B8A6' }}>{user?.role?.toUpperCase()}</b>.
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

        {/* Admin Navigation Tabs */}
        {user?.role === 'admin' && (
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
            <Tabs
              value={activeTab}
              onChange={(_, val) => setActiveTab(val)}
              textColor="inherit"
              TabIndicatorProps={{ sx: { backgroundColor: '#16B8A6' } }}
            >
              <Tab value="projects" label="My Projects" icon={<FolderGit2 size={16} />} iconPosition="start" sx={{ fontWeight: 700 }} />
              <Tab value="admin" label="Admin Management Panel" icon={<Shield size={16} />} iconPosition="start" sx={{ fontWeight: 700, color: '#0F766E' }} />
            </Tabs>
          </Box>
        )}

        {/* ADMIN MANAGEMENT VIEW */}
        {activeTab === 'admin' && user?.role === 'admin' ? (
          <Box>
            {adminActionError && <Alert severity="error" sx={{ mb: 3 }}>{adminActionError}</Alert>}

            {loadingAdmin ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress sx={{ color: '#16B8A6' }} />
              </Box>
            ) : (
              <Stack spacing={4}>
                {/* Users Management Table */}
                <Card sx={{ p: 2, borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Users size={20} color="#16B8A6" />
                      <Typography variant="h6" sx={{ fontWeight: 700, color: '#14243A' }}>
                        Platform Users ({adminUsers.length})
                      </Typography>
                    </Box>
                    <Button size="small" startIcon={<RefreshCw size={14} />} onClick={fetchAdminData}>
                      Refresh
                    </Button>
                  </Box>

                  <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #E2E8F0' }}>
                    <Table size="small">
                      <TableHead sx={{ backgroundColor: '#F8FAFC' }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Full Name</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Registered</TableCell>
                          <TableCell sx={{ fontWeight: 700 }} align="right">Active Toggle</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {adminUsers.map((u) => (
                          <TableRow key={u.id} hover>
                            <TableCell sx={{ fontWeight: 600 }}>{u.email}</TableCell>
                            <TableCell>{u.full_name || '—'}</TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={u.role.toUpperCase()}
                                sx={{
                                  backgroundColor: u.role === 'admin' ? '#FEE2E2' : '#E0F2FE',
                                  color: u.role === 'admin' ? '#991B1B' : '#075985',
                                  fontWeight: 700
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              {u.is_active ? (
                                <Chip size="small" icon={<Check size={12} />} label="Active" color="success" variant="outlined" />
                              ) : (
                                <Chip size="small" icon={<XCircle size={12} />} label="Deactivated" color="error" variant="outlined" />
                              )}
                            </TableCell>
                            <TableCell sx={{ color: '#64748B', fontSize: '0.8rem' }}>
                              {new Date(u.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell align="right">
                              <Switch
                                size="small"
                                checked={u.is_active}
                                disabled={u.email === user?.email}
                                onChange={() => handleToggleUserActive(u)}
                                color="primary"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Card>

                {/* All Projects Table */}
                <Card sx={{ p: 2, borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <FolderGit2 size={20} color="#16B8A6" />
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#14243A' }}>
                      All Platform Projects ({adminProjects.length})
                    </Typography>
                  </Box>

                  <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #E2E8F0' }}>
                    <Table size="small">
                      <TableHead sx={{ backgroundColor: '#F8FAFC' }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Project Name</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Owner</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Versions</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Created</TableCell>
                          <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {adminProjects.map((p) => (
                          <TableRow key={p.id} hover>
                            <TableCell sx={{ fontWeight: 600 }}>{p.name}</TableCell>
                            <TableCell sx={{ color: '#0369A1' }}>{p.owner_email || '—'}</TableCell>
                            <TableCell>{getProjectLifecycleBadge(p.status)}</TableCell>
                            <TableCell>{p.map_versions_count ?? (p.latest_reconstruction ? 1 : 0)}</TableCell>
                            <TableCell sx={{ color: '#64748B', fontSize: '0.8rem' }}>
                              {new Date(p.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell align="right">
                              <Stack direction="row" spacing={1} justifyContent="flex-end">
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => navigate(`/projects/${p.id}/map`)}
                                  sx={{ fontSize: '0.75rem', py: 0.2 }}
                                >
                                  Open
                                </Button>
                                <IconButton
                                  size="small"
                                  onClick={() => setDeleteTarget(p)}
                                  sx={{ color: '#EF4444' }}
                                >
                                  <Trash2 size={16} />
                                </IconButton>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Card>
              </Stack>
            )}
          </Box>
        ) : (
          /* PROJECTS VIEW */
          <Box>
            {/* Project Status Filter Tabs */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
              <Stack direction="row" spacing={1}>
                {['ALL', 'ACTIVE', 'ARCHIVED', 'COMPLETED'].map((status) => (
                  <Chip
                    key={status}
                    label={status === 'ALL' ? 'All Projects' : status}
                    clickable
                    onClick={() => setStatusFilter(status)}
                    color={statusFilter === status ? 'primary' : 'default'}
                    variant={statusFilter === status ? 'filled' : 'outlined'}
                    sx={{
                      fontWeight: 700,
                      backgroundColor: statusFilter === status ? '#14243A' : undefined,
                      color: statusFilter === status ? '#FFFFFF' : '#475569',
                    }}
                  />
                ))}
              </Stack>

              <Typography variant="body2" sx={{ color: '#64748B', fontWeight: 600 }}>
                Showing {projects.length} {statusFilter.toLowerCase()} projects
              </Typography>
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
                  {statusFilter === 'ALL' ? 'No Reconstruction Projects Yet' : `No ${statusFilter} Projects Found`}
                </Typography>
                <Typography variant="body2" sx={{ color: '#64748B', maxWidth: 460, mx: 'auto', mb: 3 }}>
                  {statusFilter === 'ALL'
                    ? 'Start by uploading an indoor video walkthrough. MAPORAA will extract frames, estimate poses, and generate preliminary 2D/3D geometry.'
                    : `No projects currently match status '${statusFilter}'. Switch filters or create a new project.`}
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
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5, gap: 1 }}>
                          <Box>
                            <Typography variant="h6" sx={{ fontWeight: 700, color: '#14243A', fontSize: '1.15rem' }}>
                              {project.name}
                            </Typography>
                            <Box sx={{ mt: 0.5, display: 'flex', gap: 1, alignItems: 'center' }}>
                              {getProjectLifecycleBadge(project.status)}
                              {project.map_versions_count && project.map_versions_count > 0 ? (
                                <Chip size="small" label={`v${project.map_versions_count}`} sx={{ backgroundColor: '#F1F5F9', color: '#475569', fontWeight: 700, fontSize: '0.65rem' }} />
                              ) : null}
                            </Box>
                          </Box>
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
                              <span>{project.videos.length} video{project.videos.length > 1 ? 's' : ''}</span>
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

                        <Stack direction="row" spacing={0.5}>
                          <Tooltip title="Edit Project Details & Status">
                            <IconButton
                              size="small"
                              onClick={() => handleOpenEdit(project)}
                              sx={{ color: '#64748B', '&:hover': { color: '#0F766E' } }}
                            >
                              <Edit3 size={16} />
                            </IconButton>
                          </Tooltip>

                          <Tooltip title="Delete Project">
                            <IconButton
                              size="small"
                              onClick={() => setDeleteTarget(project)}
                              sx={{ color: '#94A3B8', '&:hover': { color: '#EF4444' } }}
                            >
                              <Trash2 size={16} />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </Box>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>
        )}

        {/* Edit Project Dialog */}
        <Dialog open={Boolean(editTarget)} onClose={() => setEditTarget(null)} fullWidth maxWidth="xs">
          <DialogTitle sx={{ fontWeight: 700, color: '#14243A' }}>
            Edit Project
          </DialogTitle>
          <DialogContent>
            <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                fullWidth
                label="Project Name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Description"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
              />
              <FormControl fullWidth>
                <InputLabel id="status-select-label">Lifecycle Status</InputLabel>
                <Select
                  labelId="status-select-label"
                  value={editStatus}
                  label="Lifecycle Status"
                  onChange={(e) => setEditStatus(e.target.value)}
                >
                  <MenuItem value="ACTIVE">ACTIVE</MenuItem>
                  <MenuItem value="ARCHIVED">ARCHIVED</MenuItem>
                  <MenuItem value="COMPLETED">COMPLETED</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setEditTarget(null)} disabled={savingEdit} sx={{ color: '#64748B' }}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={savingEdit || !editName.trim()}
              variant="contained"
              sx={{ backgroundColor: '#16B8A6', color: '#FFFFFF', '&:hover': { backgroundColor: '#0F766E' } }}
            >
              {savingEdit ? <CircularProgress size={20} sx={{ color: '#FFFFFF' }} /> : 'Save Changes'}
            </Button>
          </DialogActions>
        </Dialog>

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
