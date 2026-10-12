import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Card, CardContent, LinearProgress,
  Button, Alert, Chip, Grid, Stack, CircularProgress
} from '@mui/material';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import {
  CheckCircle2, Clock, AlertTriangle, RefreshCw,
  Map, Box as CubeIcon, Download, ArrowRight, ShieldAlert
} from 'lucide-react';

interface StageItem {
  id: string;
  stage_number: number;
  stage_name: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: number;
  details?: string;
}

interface ReconstructionData {
  id: string;
  project_id: string;
  video_id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  current_stage: number;
  progress: number;
  error_message?: string;
  practical_feedback?: string;
  stages: StageItem[];
}

export const Processing: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [job, setJob] = useState<ReconstructionData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [retrying, setRetrying] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const initialJobId = (location.state as any)?.jobId;

  const pollJobStatus = async () => {
    try {
      if (job?.id || initialJobId) {
        const jobId = job?.id || initialJobId;
        const res = await api.get(`/reconstructions/${jobId}`);
        setJob(res.data);
      } else {
        // Fetch project to get latest reconstruction
        const pRes = await api.get(`/projects/${projectId}`);
        if (pRes.data.latest_reconstruction) {
          const res = await api.get(`/reconstructions/${pRes.data.latest_reconstruction.id}`);
          setJob(res.data);
        } else {
          setFetchError('No reconstruction job found for this project.');
        }
      }
    } catch (err: any) {
      console.error('Polling error', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    pollJobStatus();
    // Poll every 2 seconds while RUNNING or PENDING
    const interval = setInterval(() => {
      if (!job || job.status === 'RUNNING' || job.status === 'PENDING') {
        pollJobStatus();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [job?.status, job?.id, projectId]);

  const handleRetry = async () => {
    if (!job) return;
    setRetrying(true);
    try {
      const res = await api.post(`/reconstructions/${job.id}/retry`);
      setJob(res.data);
    } catch (err: any) {
      alert('Retry failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setRetrying(false);
    }
  };

  const getStageIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle2 size={18} color="#10B981" />;
      case 'RUNNING':
        return <CircularProgress size={16} sx={{ color: '#0284C7' }} />;
      case 'FAILED':
        return <AlertTriangle size={18} color="#EF4444" />;
      default:
        return <Clock size={16} color="#94A3B8" />;
    }
  };

  if (loading && !job) {
    return (
      <Box sx={{ minHeight: 'calc(100vh - 68px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress sx={{ color: '#16B8A6' }} />
      </Box>
    );
  }

  if (fetchError) {
    return (
      <Container maxWidth="md" sx={{ py: 8 }}>
        <Alert severity="warning" sx={{ mb: 3 }}>{fetchError}</Alert>
        <Button variant="contained" onClick={() => navigate(`/projects/${projectId}/upload`)}>
          Go to Video Upload
        </Button>
      </Container>
    );
  }

  const isCompleted = job?.status === 'COMPLETED';
  const isFailed = job?.status === 'FAILED';
  const isRunning = job?.status === 'RUNNING' || job?.status === 'PENDING';

  return (
    <Box sx={{ minHeight: 'calc(100vh - 68px)', backgroundColor: '#F5F7FA', py: 6 }}>
      <Container maxWidth="md">
        
        {/* Header Banner */}
        <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#14243A' }}>
              Reconstruction Pipeline
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748B', mt: 0.5 }}>
              Computer-vision multi-stage pipeline converting video walkthrough into 2D/3D geometry.
            </Typography>
          </Box>

          <Box>
            {isCompleted && (
              <Chip label="Reconstruction Completed" sx={{ backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 700, fontSize: '0.9rem', py: 2 }} />
            )}
            {isRunning && (
              <Chip label={`Processing Stage ${job?.current_stage || 1} of 10`} sx={{ backgroundColor: '#E0F2FE', color: '#0369A1', fontWeight: 700, fontSize: '0.9rem', py: 2 }} />
            )}
            {isFailed && (
              <Chip label="Reconstruction Failed" sx={{ backgroundColor: '#FEE2E2', color: '#B91C1C', fontWeight: 700, fontSize: '0.9rem', py: 2 }} />
            )}
          </Box>
        </Box>

        {/* Overall Progress Card */}
        <Card sx={{ mb: 4, overflow: 'hidden' }}>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#14243A' }}>
                {isCompleted ? 'Pipeline Complete' : isFailed ? 'Pipeline Interrupted' : 'Real-Time Pipeline Execution'}
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#16B8A6' }}>
                {job?.progress || 0}%
              </Typography>
            </Box>

            <LinearProgress
              variant={isCompleted || isFailed ? 'determinate' : 'determinate'}
              value={job?.progress || 0}
              sx={{
                height: 12,
                borderRadius: 6,
                backgroundColor: '#E2E8F0',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: isCompleted ? '#10B981' : isFailed ? '#EF4444' : '#16B8A6',
                },
              }}
            />

            {/* Completion Success Actions */}
            {isCompleted && (
              <Box sx={{ mt: 3.5, p: 2.5, backgroundColor: '#F0FDF4', borderRadius: 2, border: '1px solid #BBF7D0' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#166534', mb: 0.5 }}>
                  Geometric Extraction Succeeded!
                </Typography>
                <Typography variant="body2" sx={{ color: '#15803D', mb: 2.5 }}>
                  The 2D floor-plan geometry, room boundaries, doorway transitions, and 3D mesh artifacts are ready for inspection and interactive editing.
                </Typography>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <Button
                    variant="contained"
                    startIcon={<Map size={18} />}
                    onClick={() => navigate(`/projects/${projectId}/map`)}
                    sx={{ backgroundColor: '#14243A', fontWeight: 700, px: 3, '&:hover': { backgroundColor: '#23395B' } }}
                  >
                    Open 2D Map Editor
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<CubeIcon size={18} />}
                    onClick={() => navigate(`/projects/${projectId}/3d`)}
                    sx={{ borderColor: '#16B8A6', color: '#0F766E', fontWeight: 700, px: 3 }}
                  >
                    Inspect 3D Model
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<Download size={18} />}
                    onClick={() => navigate(`/projects/${projectId}/export`)}
                    sx={{ borderColor: '#CBD5E1', color: '#14243A', fontWeight: 600 }}
                  >
                    Export Assets
                  </Button>
                </Stack>
              </Box>
            )}

            {/* Failure Feedback & Retry Box */}
            {isFailed && (
              <Box sx={{ mt: 3.5, p: 2.5, backgroundColor: '#FEF2F2', borderRadius: 2, border: '1px solid #FECACA' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <ShieldAlert size={20} color="#DC2626" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#991B1B' }}>
                    Reconstruction Diagnostics
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ color: '#B91C1C', mb: 1.5, fontWeight: 500 }}>
                  Error: {job?.error_message || 'Video frame tracking or depth extraction could not converge.'}
                </Typography>
                {job?.practical_feedback && (
                  <Typography variant="body2" sx={{ color: '#7F1D1D', mb: 2.5, fontStyle: 'italic' }}>
                    <b>Suggestion:</b> {job.practical_feedback}
                  </Typography>
                )}

                <Button
                  variant="contained"
                  disabled={retrying}
                  startIcon={<RefreshCw size={16} />}
                  onClick={handleRetry}
                  sx={{ backgroundColor: '#DC2626', color: '#FFFFFF', fontWeight: 700, '&:hover': { backgroundColor: '#B91C1C' } }}
                >
                  {retrying ? 'Retrying Pipeline...' : 'Retry Processing'}
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* 10 Detailed Pipeline Stages List */}
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#14243A', mb: 2 }}>
          Detailed Pipeline Stages (1 to 10)
        </Typography>

        <Stack spacing={1.5}>
          {job?.stages && job.stages.map((stage) => {
            const isStageActive = stage.status === 'RUNNING';
            const isStageDone = stage.status === 'COMPLETED';
            const isStageFail = stage.status === 'FAILED';

            return (
              <Card
                key={stage.id}
                sx={{
                  backgroundColor: isStageActive ? '#F0FDF4' : '#FFFFFF',
                  borderColor: isStageActive ? '#16B8A6' : isStageDone ? '#E2E8F0' : '#F1F5F9',
                  boxShadow: isStageActive ? '0 2px 10px rgba(22, 184, 166, 0.15)' : 'none',
                }}
              >
                <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isStageDone ? '#DCFCE7' : isStageActive ? 'rgba(22, 184, 166, 0.15)' : '#F1F5F9',
                      }}
                    >
                      {getStageIcon(stage.status)}
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#14243A' }}>
                        Stage {stage.stage_number}: {stage.stage_name}
                      </Typography>
                      {stage.details && (
                        <Typography variant="caption" sx={{ color: '#64748B', display: 'block' }}>
                          {stage.details}
                        </Typography>
                      )}
                    </Box>
                  </Box>

                  <Chip
                    size="small"
                    label={stage.status}
                    sx={{
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      backgroundColor:
                        isStageDone ? '#DCFCE7' :
                        isStageActive ? '#E0F2FE' :
                        isStageFail ? '#FEE2E2' : '#F1F5F9',
                      color:
                        isStageDone ? '#15803D' :
                        isStageActive ? '#0369A1' :
                        isStageFail ? '#B91C1C' : '#94A3B8',
                    }}
                  />
                </Box>
              </Card>
            );
          })}
        </Stack>

      </Container>
    </Box>
  );
};
