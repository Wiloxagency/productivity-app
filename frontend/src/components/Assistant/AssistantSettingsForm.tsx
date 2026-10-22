import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { activitiesApi, assistantApi, projectsApi } from '../../services/api';
import type { AssistantSettings } from '../../types';
import { apiErrorMessage } from './apiError';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export default function AssistantSettingsForm() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['assistantSettings'], queryFn: assistantApi.getSettings });
  const { data: activities = [] } = useQuery({ queryKey: ['activities'], queryFn: () => activitiesApi.getAll() });
  const { data: status } = useQuery({ queryKey: ['assistantStatus'], queryFn: assistantApi.status });
  const { data: projects = [] } = useQuery({ queryKey: ['projects', 'assistant-default'], queryFn: () => projectsApi.getAll() });
  const [form, setForm] = useState<AssistantSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) setForm({ ...settings, lunchActivity: settings.lunchActivity || '', defaultProject: settings.defaultProject || '' });
  }, [settings]);

  const save = useMutation({
    mutationFn: (data: Partial<AssistantSettings>) => assistantApi.updateSettings(data),
    onSuccess: (data) => {
      queryClient.setQueryData(['assistantSettings'], data);
      queryClient.invalidateQueries({ queryKey: ['assistantLive'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  if (!form) return null;

  const invalid = [form.workdayStart, form.workdayEnd, form.lunchTime].some((v) => !HHMM.test(v));
  const set = (patch: Partial<AssistantSettings>) => setForm({ ...form, ...patch });

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Asistente IA
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Horario base y preferencias que usa el asistente para armar tu día y sugerir lo siguiente.
          Modelo: <strong>{status?.model || '—'}</strong>
          {status && !status.configured ? ' (falta OPENAI_API_KEY en api/.env)' : ''}
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Zona horaria (IANA)" value={form.timezone} onChange={(e) => set({ timezone: e.target.value })} helperText="Ej.: America/Fortaleza" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField fullWidth label="Inicio jornada" value={form.workdayStart} onChange={(e) => set({ workdayStart: e.target.value })} error={!HHMM.test(form.workdayStart)} placeholder="HH:mm" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField fullWidth label="Fin jornada" value={form.workdayEnd} onChange={(e) => set({ workdayEnd: e.target.value })} error={!HHMM.test(form.workdayEnd)} placeholder="HH:mm" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField fullWidth label="Almuerzo" value={form.lunchTime} onChange={(e) => set({ lunchTime: e.target.value })} error={!HHMM.test(form.lunchTime)} placeholder="HH:mm" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField fullWidth type="number" label="Duración almuerzo (min)" value={form.lunchDuration} onChange={(e) => set({ lunchDuration: Number(e.target.value) })} inputProps={{ min: 10, max: 180 }} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel shrink>Actividad de almuerzo</InputLabel>
              <Select label="Actividad de almuerzo" notched displayEmpty value={form.lunchActivity || ''} onChange={(e) => set({ lunchActivity: e.target.value as string })}>
                <MenuItem value="">Detectar automáticamente ("Lunch")</MenuItem>
                {activities.map((a) => (
                  <MenuItem key={a._id} value={a._id}>
                    {a.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField fullWidth type="number" label="Margen entre bloques (min)" value={form.bufferMinutes} onChange={(e) => set({ bufferMinutes: Number(e.target.value) })} inputProps={{ min: 0, max: 60 }} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField fullWidth type="number" label="Duración tarea por defecto" value={form.defaultTaskMinutes} onChange={(e) => set({ defaultTaskMinutes: Number(e.target.value) })} inputProps={{ min: 5, max: 480 }} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel shrink>Proyecto por defecto</InputLabel>
              <Select label="Proyecto por defecto" notched displayEmpty value={form.defaultProject || ''} onChange={(e) => set({ defaultProject: e.target.value as string })}>
                <MenuItem value="">"General" (se crea si no existe)</MenuItem>
                {projects.filter((p) => !p.isArchived).map((p) => (
                  <MenuItem key={p._id} value={p._id}>
                    {p.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              minRows={2}
              label="Indicaciones permanentes para el asistente"
              value={form.customInstructions}
              onChange={(e) => set({ customInstructions: e.target.value })}
              placeholder="Ej.: los viernes no agendo reuniones; prioriza Carlos V"
            />
          </Grid>
        </Grid>

        <Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
          <Button variant="contained" disabled={invalid || save.isPending} onClick={() => save.mutate({ ...form, lunchActivity: form.lunchActivity || '', defaultProject: form.defaultProject || '' })}>
            Guardar
          </Button>
          {saved && <Alert severity="success" sx={{ py: 0 }}>Guardado</Alert>}
          {save.isError && <Alert severity="error" sx={{ py: 0 }}>{apiErrorMessage(save.error, 'Error al guardar')}</Alert>}
        </Box>
      </CardContent>
    </Card>
  );
}
