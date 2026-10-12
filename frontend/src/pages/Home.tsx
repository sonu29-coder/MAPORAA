import React from 'react';
import { Box, Container, Typography, Button, Grid, Card, CardContent, Chip, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Video, Compass, Map, Box as CubeIcon, ArrowRight, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: '#F5F7FA' }}>
      
      {/* Hero Section */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #14243A 0%, #1A314E 100%)',
          color: '#FFFFFF',
          pt: { xs: 8, md: 12 },
          pb: { xs: 10, md: 14 },
          borderBottom: '1px solid rgba(22, 184, 166, 0.2)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={5} alignItems="center">
            <Grid item xs={12} md={7}>
              <Chip
                label="Computer Vision & Monocular Video Pipeline"
                sx={{
                  backgroundColor: 'rgba(22, 184, 166, 0.15)',
                  color: '#16B8A6',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  mb: 2.5,
                  border: '1px solid rgba(22, 184, 166, 0.3)',
                }}
              />
              <Typography
                variant="h2"
                sx={{
                  fontWeight: 800,
                  lineHeight: 1.15,
                  fontSize: { xs: '2.4rem', md: '3.4rem' },
                  color: '#FFFFFF',
                  mb: 2.5,
                }}
              >
                Turn Indoor Videos into Interactive Maps
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  fontSize: { xs: '1.05rem', md: '1.2rem' },
                  color: '#94A3B8',
                  lineHeight: 1.6,
                  mb: 4,
                  maxWidth: 620,
                }}
              >
                Upload a walking walkthrough recorded on any standard smartphone camera. MAPORAA extracts camera trajectory, estimates relative depth, and derives preliminary 2D floor plans and 3D architectural representations.
              </Typography>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => navigate(user ? '/dashboard' : '/register')}
                  endIcon={<ArrowRight size={18} />}
                  sx={{
                    backgroundColor: '#16B8A6',
                    color: '#FFFFFF',
                    px: 3.5,
                    py: 1.4,
                    fontSize: '1rem',
                    fontWeight: 700,
                    borderRadius: 2,
                    boxShadow: '0 4px 14px rgba(22, 184, 166, 0.4)',
                    '&:hover': { backgroundColor: '#0F766E' },
                  }}
                >
                  {user ? 'Open Dashboard' : 'Get Started Free'}
                </Button>

                <Button
                  variant="outlined"
                  size="large"
                  onClick={() => {
                    const el = document.getElementById('how-it-works');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  sx={{
                    borderColor: 'rgba(255, 255, 255, 0.25)',
                    color: '#FFFFFF',
                    px: 3,
                    py: 1.4,
                    fontSize: '1rem',
                    fontWeight: 600,
                    borderRadius: 2,
                    '&:hover': { borderColor: '#16B8A6', backgroundColor: 'rgba(22, 184, 166, 0.08)' },
                  }}
                >
                  How It Works
                </Button>
              </Stack>
            </Grid>

            {/* Application Visual Preview */}
            <Grid item xs={12} md={5}>
              <Card
                sx={{
                  backgroundColor: '#0F1A2A',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 3,
                  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
                  overflow: 'hidden',
                }}
              >
                <Box sx={{ p: 2, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600, letterSpacing: 0.5 }}>
                    SAMPLE MAPORAA RECONSTRUCTION PREVIEW
                  </Typography>
                  <Chip size="small" label="Sample Preview" sx={{ backgroundColor: 'rgba(22, 184, 166, 0.2)', color: '#16B8A6', fontSize: '0.7rem' }} />
                </Box>
                <Box sx={{ p: 2.5, backgroundColor: '#14243A' }}>
                  <svg viewBox="0 0 320 220" width="100%" height="200" style={{ background: '#0F172A', borderRadius: 8 }}>
                    {/* Grid */}
                    <defs>
                      <pattern id="home-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1E293B" strokeWidth="0.8"/>
                      </pattern>
                    </defs>
                    <rect width="320" height="220" fill="url(#home-grid)" />

                    {/* Rooms */}
                    <rect x="40" y="40" width="120" height="140" fill="#16B8A6" fillOpacity="0.12" stroke="#16B8A6" strokeWidth="1" strokeDasharray="3,3" />
                    <text x="100" y="110" fill="#16B8A6" fontSize="10" fontWeight="bold" textAnchor="middle">Living Hall</text>

                    <rect x="160" y="40" width="120" height="140" fill="#0284C7" fillOpacity="0.12" stroke="#0284C7" strokeWidth="1" strokeDasharray="3,3" />
                    <text x="220" y="110" fill="#38BDF8" fontSize="10" fontWeight="bold" textAnchor="middle">Office Suite</text>

                    {/* Exterior Walls */}
                    <line x1="40" y1="40" x2="280" y2="40" stroke="#F8FAFC" strokeWidth="4" />
                    <line x1="280" y1="40" x2="280" y2="180" stroke="#F8FAFC" strokeWidth="4" />
                    <line x1="280" y1="180" x2="40" y2="180" stroke="#F8FAFC" strokeWidth="4" />
                    <line x1="40" y1="180" x2="40" y2="40" stroke="#F8FAFC" strokeWidth="4" />

                    {/* Partition with Door */}
                    <line x1="160" y1="40" x2="160" y2="90" stroke="#94A3B8" strokeWidth="3" />
                    <line x1="160" y1="130" x2="160" y2="180" stroke="#94A3B8" strokeWidth="3" />
                    <circle cx="160" cy="110" r="10" fill="none" stroke="#16B8A6" strokeWidth="1.5" strokeDasharray="2,2" />
                    <text x="160" y="113" fill="#16B8A6" fontSize="8" textAnchor="middle">Door</text>

                    {/* Trajectory */}
                    <path d="M 60,150 Q 100,140 130,110 T 190,110 T 250,90" fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="4,3" />
                    <circle cx="250" cy="90" r="3" fill="#F59E0B" />
                  </svg>
                  <Stack direction="row" spacing={2} sx={{ mt: 2 }} justifyContent="space-between">
                    <Typography variant="caption" sx={{ color: '#94A3B8' }}>Camera Trajectory &bull; 2 Inferred Rooms</Typography>
                    <Typography variant="caption" sx={{ color: '#16B8A6', fontWeight: 600 }}>Uncalibrated Metric Scale</Typography>
                  </Stack>
                </Box>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* How It Works Section */}
      <Container id="how-it-works" maxWidth="lg" sx={{ py: 10 }}>
        <Box sx={{ textAlign: 'center', mb: 7 }}>
          <Typography variant="overline" sx={{ color: '#16B8A6', fontWeight: 700, letterSpacing: 1.5 }}>
            END-TO-END WORKFLOW
          </Typography>
          <Typography variant="h3" sx={{ fontWeight: 800, mt: 0.5, color: '#14243A' }}>
            How MAPORAA Reconstructs Indoor Spaces
          </Typography>
          <Typography variant="body1" sx={{ color: '#64748B', maxWidth: 650, mx: 'auto', mt: 1.5 }}>
            A structured 10-stage processing pipeline translating single-camera video motion into preliminary 2D CAD floor plans.
          </Typography>
        </Box>

        <Grid container spacing={3.5}>
          {[
            {
              icon: <Video size={28} color="#16B8A6" />,
              step: '01',
              title: 'Record & Upload Video',
              desc: 'Walk smoothly across the room recording with any smartphone camera at eye level. Server verifies integrity with OpenCV.',
            },
            {
              icon: <Compass size={28} color="#16B8A6" />,
              step: '02',
              title: 'Pose & Depth Estimation',
              desc: 'Feature matching and optical flow estimate camera motion. Monocular depth cues approximate relative spatial distances.',
            },
            {
              icon: <CubeIcon size={28} color="#16B8A6" />,
              step: '03',
              title: 'Point Cloud & Wall Projection',
              desc: '3D point samples are projected to the ground plane, segmenting vertical wall candidates and doorway thresholds.',
            },
            {
              icon: <Map size={28} color="#16B8A6" />,
              step: '04',
              title: 'Interactive Editor & Export',
              desc: 'Fine-tune walls, adjust doors, name rooms, explore in 3D with Three.js, and export genuine SVG, PDF, and OBJ models.',
            },
          ].map((item, idx) => (
            <Grid item xs={12} sm={6} md={3} key={idx}>
              <Card sx={{ height: '100%', p: 1, transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-4px)' } }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Box sx={{ p: 1.2, borderRadius: 2, backgroundColor: 'rgba(22, 184, 166, 0.1)' }}>
                      {item.icon}
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 800, color: '#CBD5E1' }}>
                      {item.step}
                    </Typography>
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: '#14243A' }}>
                    {item.title}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#64748B', lineHeight: 1.6 }}>
                    {item.desc}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* Honest Limitations & Guidance Box */}
      <Box sx={{ backgroundColor: '#FFFFFF', py: 8, borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
        <Container maxWidth="lg">
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <ShieldCheck size={26} color="#16B8A6" />
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#14243A' }}>
                  Engineering Principles & Capabilities
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ color: '#64748B', mb: 3, lineHeight: 1.7 }}>
                MAPORAA was engineered to evaluate single-camera monocular computer vision without requiring dedicated LiDAR sensors.
              </Typography>
              <Stack spacing={1.8}>
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                  <CheckCircle2 size={18} color="#10B981" style={{ flexShrink: 0, marginTop: 2 }} />
                  <Typography variant="body2" sx={{ color: '#334155' }}>
                    <b>Real Background Processing:</b> Multi-stage pipeline with progress tracking across video validation, keyframe extraction, and point cloud creation.
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                  <CheckCircle2 size={18} color="#10B981" style={{ flexShrink: 0, marginTop: 2 }} />
                  <Typography variant="body2" sx={{ color: '#334155' }}>
                    <b>Editable 2D Workspace:</b> Move walls, insert doorways, label rooms, with persistent revision history in PostgreSQL / SQLite.
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                  <CheckCircle2 size={18} color="#10B981" style={{ flexShrink: 0, marginTop: 2 }} />
                  <Typography variant="body2" sx={{ color: '#334155' }}>
                    <b>Authorized File Exports:</b> Genuine SVG, PDF architectural reports, and OBJ 3D models generated on the server.
                  </Typography>
                </Box>
              </Stack>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card sx={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', p: 2 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, mb: 1.5 }}>
                    <AlertTriangle size={22} color="#D97706" />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#92400E' }}>
                      Reconstruction Limitations Notice
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ color: '#78350F', lineHeight: 1.6, mb: 2 }}>
                    Monocular depth estimation does not possess absolute metric scale without reference markers or calibrated stereo baselines. MAPORAA generates <b>preliminary layout estimates</b>.
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#92400E', fontWeight: 600, display: 'block', mb: 1 }}>
                    Recording Recommendations:
                  </Typography>
                  <ul style={{ margin: 0, paddingLeft: 20, color: '#78350F', fontSize: '0.85rem' }}>
                    <li>Maintain uniform walking speed (approx. 0.8 m/s).</li>
                    <li>Ensure well-diffused indoor lighting with minimal glare.</li>
                    <li>Avoid rapid panning or shaking to prevent motion blur.</li>
                  </ul>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Footer */}
      <Box sx={{ py: 5, backgroundColor: '#14243A', color: '#94A3B8', textAlign: 'center' }}>
        <Container maxWidth="lg">
          <Typography variant="body2" sx={{ color: '#E2E8F0', fontWeight: 600, mb: 0.5 }}>
            MAPORAA &bull; AI-Based Indoor Map Generation
          </Typography>
          <Typography variant="caption" sx={{ color: '#64748B' }}>
            Built with React, Vite, Material UI, Three.js, FastAPI, OpenCV, and SQLAlchemy.
          </Typography>
        </Container>
      </Box>
    </Box>
  );
};
