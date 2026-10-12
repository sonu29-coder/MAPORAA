import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Container, Typography, TextField, Button, Card, CardContent,
  Alert, LinearProgress, Stack, Stepper, Step, StepLabel, Grid, Chip
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import {
  UploadCloud, FileVideo, CheckCircle2, Play, AlertCircle,
  X, RefreshCw, ArrowRight, ArrowLeft
} from 'lucide-react';

const STEPS = ['Project Details', 'Select Video', 'Upload & Validate', 'Review & Reconstruct'];

export const ProjectWizard: React.FC = () => {
  const navigate = useNavigate();
  const { projectId: existingProjectId } = useParams<{ projectId: string }>();

  const [activeStep, setActiveStep] = useState(existingProjectId ? 1 : 0);
  const [projectId, setProjectId] = useState<string | null>(existingProjectId || null);

  // Step 1: Project Details
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);

  // Step 2 & 3: Video File Selection & Validation
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedVideo, setUploadedVideo] = useState<any | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // If existing project, load details
  useEffect(() => {
    if (existingProjectId) {
      api.get(`/projects/${existingProjectId}`)
        .then((res) => {
          setProjectName(res.data.name);
          setProjectDesc(res.data.description || '');
          if (res.data.videos && res.data.videos.length > 0) {
            setUploadedVideo(res.data.videos[res.data.videos.length - 1]);
            setActiveStep(3);
          }
        })
        .catch((err) => console.error('Failed to load project', err));
    }
  }, [existingProjectId]);

  // Clean up object URL when component unmounts or file changes
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Step 1: Submit Project Info
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setProjectError(null);
    if (!projectName.trim()) {
      setProjectError('Please provide a project name.');
      return;
    }

    setCreatingProject(true);
    try {
      const res = await api.post('/projects', {
        name: projectName.trim(),
        description: projectDesc.trim() || undefined,
      });
      setProjectId(res.data.id);
      setActiveStep(1);
    } catch (err: any) {
      setProjectError(err.response?.data?.detail || 'Failed to create project.');
    } finally {
      setCreatingProject(false);
    }
  };

  // Step 2: Handle File Drop / Select
  const handleFileSelect = (file: File) => {
    setUploadError(null);
    const validExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv'];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

    if (!validExtensions.includes(ext)) {
      setUploadError(`Unsupported format '${ext}'. Allowed: MP4, MOV, WebM.`);
      return;
    }

    // 250 MB client limit
    if (file.size > 250 * 1024 * 1024) {
      setUploadError(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed is 250 MB.`);
      return;
    }

    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  // Step 3: Server Upload & OpenCV Validation
  const handleUploadAndValidate = async () => {
    if (!selectedFile || !projectId) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await api.post(`/projects/${projectId}/videos`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(pct);
          }
        },
      });

      setUploadedVideo(res.data);
      setActiveStep(3); // advance to Review & Reconstruct
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setUploadError(typeof detail === 'string' ? detail : 'Video upload failed. Check format or connection.');
    } finally {
      setIsUploading(false);
    }
  };

  // Step 4: Start Reconstruction
  const handleStartReconstruction = async () => {
    if (!projectId) return;
    try {
      const res = await api.post(`/projects/${projectId}/reconstructions`);
      navigate(`/projects/${projectId}/processing`, { state: { jobId: res.data.id } });
    } catch (err: any) {
      setUploadError(err.response?.data?.detail || 'Failed to start reconstruction.');
    }
  };

  return (
    <Box sx={{ minHeight: 'calc(100vh - 68px)', backgroundColor: '#F5F7FA', py: 6 }}>
      <Container maxWidth="md">
        
        {/* Wizard Stepper */}
        <Box sx={{ mb: 5 }}>
          <Typography variant="h4" sx={{ fontWeight: 800, color: '#14243A', mb: 1 }}>
            Indoor Map Creation Wizard
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748B', mb: 3 }}>
            Follow the 4-step workflow to convert your indoor walkthrough video into an interactive floor plan.
          </Typography>

          <Stepper activeStep={activeStep} alternativeLabel>
            {STEPS.map((label) => (
              <Step key={label}>
                <StepLabel
                  StepIconProps={{
                    sx: {
                      '&.Mui-active': { color: '#16B8A6' },
                      '&.Mui-completed': { color: '#10B981' },
                    },
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{label}</span>
                </StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        {/* STEP 0: Project Details */}
        {activeStep === 0 && (
          <Card>
            <CardContent sx={{ p: 4 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#14243A', mb: 1 }}>
                Step 1: Define Project Information
              </Typography>
              <Typography variant="body2" sx={{ color: '#64748B', mb: 3 }}>
                Provide a descriptive name for the building, apartment, or room to be mapped.
              </Typography>

              {projectError && <Alert severity="error" sx={{ mb: 3 }}>{projectError}</Alert>}

              <form onSubmit={handleCreateProject}>
                <TextField
                  fullWidth
                  label="Project / Property Name"
                  required
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  margin="normal"
                  placeholder="e.g. 2nd Floor Studio Walkthrough"
                />
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Description (Optional)"
                  value={projectDesc}
                  onChange={(e) => setProjectDesc(e.target.value)}
                  margin="normal"
                  placeholder="Notes on lighting conditions, room sequence, or walkthrough path..."
                />

                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={creatingProject}
                    endIcon={<ArrowRight size={18} />}
                    sx={{ backgroundColor: '#14243A', px: 3, py: 1.2, fontWeight: 700, '&:hover': { backgroundColor: '#23395B' } }}
                  >
                    {creatingProject ? 'Creating...' : 'Continue to Video Selection'}
                  </Button>
                </Box>
              </form>
            </CardContent>
          </Card>
        )}

        {/* STEP 1: Video Selection & Preview */}
        {activeStep === 1 && (
          <Card>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#14243A' }}>
                  Step 2: Select Walkthrough Video
                </Typography>
                <Chip size="small" label={`Project: ${projectName}`} sx={{ backgroundColor: 'rgba(22, 184, 166, 0.15)', color: '#16B8A6', fontWeight: 600 }} />
              </Box>
              <Typography variant="body2" sx={{ color: '#64748B', mb: 3 }}>
                Upload an MP4, MOV, or WebM indoor walking video (max 250 MB).
              </Typography>

              {uploadError && <Alert severity="error" sx={{ mb: 3 }}>{uploadError}</Alert>}

              {!selectedFile ? (
                /* Drag & Drop Area */
                <Box
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  sx={{
                    border: '2px dashed #94A3B8',
                    borderRadius: 3,
                    p: 6,
                    textAlign: 'center',
                    backgroundColor: '#F8FAFC',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': { borderColor: '#16B8A6', backgroundColor: 'rgba(22, 184, 166, 0.04)' },
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleFileSelect(e.target.files[0]);
                      }
                    }}
                  />
                  <Box sx={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: 'rgba(22, 184, 166, 0.1)', color: '#16B8A6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
                    <UploadCloud size={30} />
                  </Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#14243A' }}>
                    Drag & Drop your walkthrough video here
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#64748B', mt: 0.5 }}>
                    or click to browse local files on your device
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', mt: 1.5 }}>
                    Supported: MP4, MOV, WebM &bull; Maximum file size: 250 MB
                  </Typography>
                </Box>
              ) : (
                /* Selected File Preview Box */
                <Box sx={{ border: '1px solid #CBD5E1', borderRadius: 3, p: 3, backgroundColor: '#FFFFFF' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <FileVideo size={24} color="#16B8A6" />
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#14243A' }}>
                          {selectedFile.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748B' }}>
                          {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB &bull; {selectedFile.type || 'Video Stream'}
                        </Typography>
                      </Box>
                    </Box>
                    <Button
                      size="small"
                      color="error"
                      startIcon={<X size={16} />}
                      onClick={handleRemoveFile}
                    >
                      Remove
                    </Button>
                  </Box>

                  {/* HTML5 Video Preview Player */}
                  {previewUrl && (
                    <Box sx={{ mt: 2, borderRadius: 2, overflow: 'hidden', backgroundColor: '#000000', maxHeight: 300, display: 'flex', justifyContent: 'center' }}>
                      <video
                        src={previewUrl}
                        controls
                        style={{ maxWidth: '100%', maxHeight: 300, outline: 'none' }}
                      />
                    </Box>
                  )}
                </Box>
              )}

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
                <Button
                  startIcon={<ArrowLeft size={16} />}
                  onClick={() => setActiveStep(0)}
                  sx={{ color: '#64748B' }}
                >
                  Edit Project Details
                </Button>
                <Button
                  variant="contained"
                  disabled={!selectedFile}
                  onClick={() => {
                    setActiveStep(2);
                    handleUploadAndValidate();
                  }}
                  endIcon={<ArrowRight size={18} />}
                  sx={{ backgroundColor: '#14243A', px: 3, py: 1.2, fontWeight: 700, '&:hover': { backgroundColor: '#23395B' } }}
                >
                  Proceed to Upload & Validate
                </Button>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* STEP 2: Real Server Upload & Validation */}
        {activeStep === 2 && (
          <Card>
            <CardContent sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#14243A', mb: 1 }}>
                Step 3: Uploading & Server-Side OpenCV Validation
              </Typography>
              <Typography variant="body2" sx={{ color: '#64748B', mb: 4 }}>
                Streaming actual video to storage and verifying decoder compatibility...
              </Typography>

              {uploadError ? (
                <Box>
                  <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>
                    {uploadError}
                  </Alert>
                  <Button
                    variant="outlined"
                    startIcon={<RefreshCw size={16} />}
                    onClick={handleUploadAndValidate}
                    sx={{ mr: 2 }}
                  >
                    Retry Upload
                  </Button>
                  <Button
                    onClick={() => setActiveStep(1)}
                    sx={{ color: '#64748B' }}
                  >
                    Select Different File
                  </Button>
                </Box>
              ) : (
                <Box sx={{ maxWidth: 500, mx: 'auto', py: 4 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: '#14243A' }}>
                      {uploadProgress < 100 ? 'Uploading to Server...' : 'Executing OpenCV Codec Verification...'}
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#16B8A6' }}>
                      {uploadProgress}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant={uploadProgress < 100 ? 'determinate' : 'indeterminate'}
                    value={uploadProgress}
                    sx={{ height: 10, borderRadius: 5, backgroundColor: '#E2E8F0', '& .MuiLinearProgress-bar': { backgroundColor: '#16B8A6' } }}
                  />
                  <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', mt: 2 }}>
                    OpenCV checks frame headers, duration, and stream integrity before queueing AI models.
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        )}

        {/* STEP 3: Review Video Metadata & Start Reconstruction */}
        {activeStep === 3 && (
          <Card>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                <CheckCircle2 size={24} color="#10B981" />
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#14243A' }}>
                  Step 4: Video Validated & Ready for Reconstruction
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ color: '#64748B', mb: 3 }}>
                Review extracted video properties before initiating the 10-stage computer-vision reconstruction pipeline.
              </Typography>

              {/* Extracted Metadata Grid */}
              <Grid container spacing={2} sx={{ mb: 4 }}>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ p: 2, backgroundColor: '#F8FAFC', borderRadius: 2, border: '1px solid #E2E8F0' }}>
                    <Typography variant="caption" sx={{ color: '#64748B', display: 'block' }}>Resolution</Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#14243A' }}>
                      {uploadedVideo?.width && uploadedVideo?.height ? `${uploadedVideo.width} × ${uploadedVideo.height}` : 'HD / Auto'}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ p: 2, backgroundColor: '#F8FAFC', borderRadius: 2, border: '1px solid #E2E8F0' }}>
                    <Typography variant="caption" sx={{ color: '#64748B', display: 'block' }}>Duration</Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#14243A' }}>
                      {uploadedVideo?.duration ? `${uploadedVideo.duration} sec` : 'Verified'}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ p: 2, backgroundColor: '#F8FAFC', borderRadius: 2, border: '1px solid #E2E8F0' }}>
                    <Typography variant="caption" sx={{ color: '#64748B', display: 'block' }}>Frame Rate</Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#14243A' }}>
                      {uploadedVideo?.fps ? `${uploadedVideo.fps} FPS` : '30.0 FPS'}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ p: 2, backgroundColor: '#F8FAFC', borderRadius: 2, border: '1px solid #E2E8F0' }}>
                    <Typography variant="caption" sx={{ color: '#64748B', display: 'block' }}>Format / Size</Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#14243A' }}>
                      {uploadedVideo?.format || 'MP4'} &bull; {uploadedVideo?.file_size ? `${(uploadedVideo.file_size / (1024 * 1024)).toFixed(1)} MB` : ''}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>

              <Alert severity="info" sx={{ mb: 4, borderRadius: 2 }}>
                <b>Monocular Scale Notice:</b> Monocular depth estimation reconstructs structural boundaries with estimated metric dimensions. You will be able to review and adjust wall lengths in the interactive 2D floor-plan editor once processing completes.
              </Alert>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Button
                  onClick={() => setActiveStep(1)}
                  sx={{ color: '#64748B' }}
                >
                  Upload Different Video
                </Button>

                <Button
                  variant="contained"
                  size="large"
                  onClick={handleStartReconstruction}
                  startIcon={<Play size={18} />}
                  sx={{
                    backgroundColor: '#16B8A6',
                    px: 4,
                    py: 1.4,
                    fontWeight: 700,
                    fontSize: '1rem',
                    boxShadow: '0 4px 14px rgba(22, 184, 166, 0.4)',
                    '&:hover': { backgroundColor: '#0F766E' },
                  }}
                >
                  Start Reconstruction
                </Button>
              </Box>
            </CardContent>
          </Card>
        )}

      </Container>
    </Box>
  );
};
