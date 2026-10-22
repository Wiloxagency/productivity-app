import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assistantApi } from '../../services/api';
import type { AssistantMemoryKind } from '../../types';
import { apiErrorMessage } from './apiError';

const KIND_LABEL: Record<AssistantMemoryKind, string> = {
  preference: 'Preferencia',
  style: 'Estilo',
  habit: 'Hábito',
  fact: 'Dato',
  reminder: 'Recordatorio',
  note: 'Nota',
};

const KIND_COLOR: Record<AssistantMemoryKind, 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'info'> = {
  preference: 'primary',
  style: 'secondary',
  habit: 'success',
  fact: 'info',
  reminder: 'warning',
  note: 'default',
};

// What the assistant remembers between conversations. One-shot items
// (reminders already scheduled) leave this list by themselves.
export default function AssistantMemoryCard() {
  const queryClient = useQueryClient();
  const { data: memories = [], isLoading } = useQuery({ queryKey: ['assistantMemory'], queryFn: assistantApi.memory });
  const [kind, setKind] = useState<AssistantMemoryKind>('preference');
  const [text, setText] = useState('');

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['assistantMemory'] });
  const add = useMutation({
    mutationFn: () => assistantApi.addMemory({ kind, text }),
    onSuccess: () => {
      setText('');
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => assistantApi.deleteMemory(id), onSuccess: refresh });

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Memoria del asistente
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Lo que el asistente recuerda entre conversaciones: preferencias, estilo, duraciones habituales y recordatorios.
          Los recordatorios desaparecen solos cuando se agendan.
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <Select size="small" value={kind} onChange={(e) => setKind(e.target.value as AssistantMemoryKind)} sx={{ minWidth: 150 }}>
            {(Object.keys(KIND_LABEL) as AssistantMemoryKind[]).map((k) => (
              <MenuItem key={k} value={k}>
                {KIND_LABEL[k]}
              </MenuItem>
            ))}
          </Select>
          <TextField
            size="small"
            sx={{ flex: 1, minWidth: 220 }}
            placeholder="Ej.: natación dura 1 hora; respóndeme con listas cortas"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && text.trim()) add.mutate();
            }}
          />
          <Button variant="outlined" disabled={!text.trim() || add.isPending} onClick={() => add.mutate()}>
            Agregar
          </Button>
        </Box>
        {add.isError && <Alert severity="error" sx={{ mb: 1 }}>{apiErrorMessage(add.error, 'No se pudo guardar')}</Alert>}

        {isLoading ? null : memories.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Aún no hay nada en memoria.
          </Typography>
        ) : (
          <List dense disablePadding>
            {memories.map((m) => (
              <ListItem
                key={m._id}
                divider
                secondaryAction={
                  <Tooltip title="Olvidar">
                    <IconButton edge="end" size="small" onClick={() => remove.mutate(m._id)} disabled={remove.isPending}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                }
              >
                <Chip size="small" label={KIND_LABEL[m.kind] || m.kind} color={KIND_COLOR[m.kind] || 'default'} sx={{ mr: 1.5, minWidth: 96 }} />
                <ListItemText
                  primary={m.text}
                  secondary={[
                    m.subject,
                    m.minutes ? `${m.minutes} min` : null,
                    m.kind === 'reminder' ? (m.dueDate ? `desde ${m.dueDate}` : 'sin fecha') : null,
                  ].filter(Boolean).join(' · ') || undefined}
                />
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );
}
