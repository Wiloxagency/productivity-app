import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  Fab,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  AutoAwesome as AssistantIcon,
  Close as CloseIcon,
  History as HistoryIcon,
  AddComment as NewChatIcon,
  Send as SendIcon,
  Undo as UndoIcon,
  PlayArrow as PlayIcon,
  CheckCircle as DoneIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { isAxiosError } from 'axios';
import { assistantApi, timeEntriesApi } from '../../services/api';
import { apiErrorMessage } from './apiError';
import type { AssistantMessage } from '../../types';

const PANEL_WIDTH = 420;
const STORAGE_KEY = 'assistant.conversationId';

const QUICK_PROMPTS = [
  '¿Qué sigue?',
  'Arma mi día',
  'Termina la tarea actual',
  'Voy a nadar, luego al gimnasio y por último a caminar',
];

const readStoredConversation = (): string | null => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const storeConversation = (id: string | null) => {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
};

// Minimal **bold** rendering for assistant replies
const renderText = (text: string) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : <span key={index}>{part}</span>
  );

export default function AssistantPanel() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(() => readStoredConversation());
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [historyAnchor, setHistoryAnchor] = useState<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: status } = useQuery({
    queryKey: ['assistantStatus'],
    queryFn: assistantApi.status,
    staleTime: 10 * 60 * 1000,
  });

  const { data: live } = useQuery({
    queryKey: ['assistantLive'],
    queryFn: assistantApi.live,
    enabled: open,
    refetchInterval: open ? 30000 : false,
  });

  const { data: conversations = [], refetch: refetchConversations } = useQuery({
    queryKey: ['assistantConversations'],
    queryFn: assistantApi.conversations,
    enabled: open,
  });

  // Load the stored thread when the panel opens
  useEffect(() => {
    if (!open || !conversationId || messages.length) return;
    assistantApi
      .conversation(conversationId)
      .then((c) => setMessages(c.messages))
      .catch(() => {
        storeConversation(null);
        setConversationId(null);
      });
  }, [open, conversationId, messages.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  // Ctrl/Cmd + J toggles the panel
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const refreshAppData = useCallback(() => {
    // The assistant can touch tasks, planning, entries… refresh everything.
    queryClient.invalidateQueries();
  }, [queryClient]);

  const chatMutation = useMutation({
    mutationFn: (message: string) => assistantApi.chat({ conversationId, message }),
    onSuccess: (result) => {
      setConversationId(result.conversationId);
      storeConversation(result.conversationId);
      setMessages((prev) => [...prev.filter((m) => !m.pending), result.message]);
      refreshAppData();
      refetchConversations();
    },
    onError: (err: unknown) => {
      const message = apiErrorMessage(err, 'Error al contactar al asistente');
      const failedConversation = isAxiosError(err)
        ? (err.response?.data as { conversationId?: string } | undefined)?.conversationId
        : undefined;
      if (failedConversation) {
        setConversationId(failedConversation);
        storeConversation(failedConversation);
      }
      setMessages((prev) => prev.filter((m) => !m.pending));
      setError(message);
      refreshAppData();
    },
  });

  const undoMutation = useMutation({
    mutationFn: (actionId: string) => assistantApi.undo(actionId),
    onSuccess: (_data, actionId) => {
      setMessages((prev) =>
        prev.map((m) => ({
          ...m,
          actions: m.actions.map((a) => (a.id === actionId ? { ...a, undone: true } : a)),
        }))
      );
      refreshAppData();
    },
    onError: (err: unknown) => setError(apiErrorMessage(err, 'No se pudo deshacer')),
  });

  const startNextMutation = useMutation({
    mutationFn: async () => {
      const next = live?.next;
      if (!next) return null;
      const localDate = dayjs().format('YYYY-MM-DD');
      return next.itemType === 'task'
        ? timeEntriesApi.startWithTask({ task: next.id, isPomodoro: true, localDate })
        : timeEntriesApi.start({ activity: next.id, isPomodoro: true, localDate });
    },
    onSuccess: () => refreshAppData(),
  });

  const send = (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || chatMutation.isPending) return;
    setError(null);
    setInput('');
    const now = new Date().toISOString();
    setMessages((prev) => [
      ...prev,
      { id: `local-${now}`, role: 'user', content: message, createdAt: now, actions: [] },
      { id: `pending-${now}`, role: 'assistant', content: '', createdAt: now, actions: [], pending: true },
    ]);
    chatMutation.mutate(message);
  };

  const newConversation = () => {
    setConversationId(null);
    storeConversation(null);
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  };

  const openConversation = async (id: string) => {
    setHistoryAnchor(null);
    try {
      const c = await assistantApi.conversation(id);
      setConversationId(id);
      storeConversation(id);
      setMessages(c.messages);
      setError(null);
    } catch {
      setError('No se pudo abrir la conversación');
    }
  };

  const liveCard = useMemo(() => {
    if (!live) return null;
    const { active, next, queue } = live;
    const pendingQueue = queue.filter((q) => q.status === 'pending');
    if (!active && !next) return null;
    return (
      <Box sx={{ px: 2, py: 1.5, bgcolor: 'rgba(79,70,229,0.05)', borderBottom: '1px solid', borderColor: 'divider' }}>
        {active && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: next ? 0.75 : 0 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main', flexShrink: 0 }} />
            <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
              <strong>En curso:</strong> {active.title}
            </Typography>
            {active.plannedEndLocal && (
              <Chip
                size="small"
                icon={<ScheduleIcon />}
                label={`${active.autoStop ? 'cierra' : 'fin'} ${active.plannedEndLocal}`}
                variant="outlined"
              />
            )}
          </Stack>
        )}
        {next && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" noWrap>
                <strong>Siguiente:</strong> {next.title}
                {next.startsAtLocal ? ` · ${next.startsAtLocal}` : ''}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                {next.reason}
                {pendingQueue.length > 1 ? ` · ${pendingQueue.length} en cola` : ''}
              </Typography>
            </Box>
            {!(next.source === 'queue' && next.autoStart && active) && (
              <Tooltip title="Iniciar ahora">
                <span>
                  <IconButton
                    size="small"
                    color="primary"
                    onClick={() => startNextMutation.mutate()}
                    disabled={startNextMutation.isPending}
                  >
                    <PlayIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </Stack>
        )}
      </Box>
    );
  }, [live, startNextMutation]);

  return (
    <>
      {!open && (
        <Tooltip title="Asistente (Ctrl/⌘ + J)" placement="left">
          <Fab
            color="primary"
            aria-label="Abrir asistente"
            onClick={() => setOpen(true)}
            sx={{ position: 'fixed', right: 24, bottom: 24, zIndex: (t) => t.zIndex.drawer + 2 }}
          >
            <AssistantIcon />
          </Fab>
        </Tooltip>
      )}

      <Drawer
        anchor="right"
        variant={isMobile ? 'temporary' : 'persistent'}
        open={open}
        onClose={() => setOpen(false)}
        sx={{
          '& .MuiDrawer-paper': {
            width: isMobile ? '100%' : PANEL_WIDTH,
            boxSizing: 'border-box',
            zIndex: (t) => t.zIndex.drawer + 2,
            boxShadow: '-8px 0 32px rgba(15,23,42,0.12)',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        {/* Header */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            }}
          >
            <AssistantIcon fontSize="small" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ lineHeight: 1.1 }}>
              Asistente
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {status?.model || 'gpt-6-astra'}
            </Typography>
          </Box>
          <Tooltip title="Historial">
            <IconButton size="small" onClick={(e) => setHistoryAnchor(e.currentTarget)}>
              <HistoryIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Nueva conversación">
            <IconButton size="small" onClick={newConversation}>
              <NewChatIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Cerrar">
            <IconButton size="small" onClick={() => setOpen(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        <Menu anchorEl={historyAnchor} open={!!historyAnchor} onClose={() => setHistoryAnchor(null)}>
          {conversations.length === 0 && <MenuItem disabled>Sin conversaciones</MenuItem>}
          {conversations.map((c) => (
            <MenuItem key={c.id} selected={c.id === conversationId} onClick={() => openConversation(c.id)} sx={{ maxWidth: 360 }}>
              <ListItemText
                primary={c.title}
                secondary={dayjs(c.updatedAt).format('DD/MM HH:mm')}
                primaryTypographyProps={{ noWrap: true, fontSize: 14 }}
              />
            </MenuItem>
          ))}
        </Menu>

        {liveCard}

        {status && !status.configured && (
          <Alert severity="warning" sx={{ m: 2, mb: 0 }}>
            Falta <code>OPENAI_API_KEY</code> en <code>api/.env</code>.
          </Alert>
        )}

        {/* Thread */}
        <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', px: 2, py: 2 }}>
          {messages.length === 0 && (
            <Box sx={{ textAlign: 'center', color: 'text.secondary', mt: 4 }}>
              <Typography variant="body2" sx={{ mb: 2 }}>
                Pídeme crear tareas, encadenar actividades, ajustar tiempos o armar tu día.
              </Typography>
              <Stack spacing={1} alignItems="center">
                {QUICK_PROMPTS.map((prompt) => (
                  <Chip key={prompt} label={prompt} variant="outlined" onClick={() => send(prompt)} sx={{ maxWidth: '100%' }} />
                ))}
              </Stack>
            </Box>
          )}

          <Stack spacing={1.5}>
            {messages.map((m) => (
              <Box key={m.id} sx={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <Box
                  sx={{
                    maxWidth: '88%',
                    px: 1.5,
                    py: 1,
                    borderRadius: 2,
                    fontSize: 14,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    ...(m.role === 'user'
                      ? { bgcolor: 'primary.main', color: 'primary.contrastText', borderBottomRightRadius: 4 }
                      : { bgcolor: 'rgba(15,23,42,0.05)', color: 'text.primary', borderBottomLeftRadius: 4 }),
                  }}
                >
                  {m.pending ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CircularProgress size={14} />
                      <span>Pensando…</span>
                    </Stack>
                  ) : (
                    renderText(m.content)
                  )}
                </Box>
                {m.actions.length > 0 && (
                  <Stack spacing={0.5} sx={{ mt: 0.75, width: '88%' }}>
                    {m.actions.map((a) => (
                      <Stack
                        key={a.id}
                        direction="row"
                        alignItems="center"
                        spacing={1}
                        sx={{
                          px: 1.25,
                          py: 0.5,
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 1.5,
                          bgcolor: 'background.paper',
                          opacity: a.undone ? 0.55 : 1,
                        }}
                      >
                        <DoneIcon sx={{ fontSize: 16, color: a.undone ? 'text.disabled' : 'success.main' }} />
                        <Typography
                          variant="caption"
                          sx={{ flex: 1, minWidth: 0, textDecoration: a.undone ? 'line-through' : 'none' }}
                        >
                          {a.summary}
                        </Typography>
                        {a.undone ? (
                          <Typography variant="caption" color="text.secondary">
                            Deshecho
                          </Typography>
                        ) : (
                          <Button
                            size="small"
                            startIcon={<UndoIcon sx={{ fontSize: 14 }} />}
                            onClick={() => undoMutation.mutate(a.id)}
                            disabled={undoMutation.isPending}
                            sx={{ minWidth: 0, px: 1, py: 0, fontSize: 12 }}
                          >
                            Deshacer
                          </Button>
                        )}
                      </Stack>
                    ))}
                  </Stack>
                )}
              </Box>
            ))}
          </Stack>
        </Box>

        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mx: 2, mb: 1 }}>
            {error}
          </Alert>
        )}

        <Divider />
        {/* Composer */}
        <Box sx={{ p: 1.5 }}>
          <Stack direction="row" spacing={1} alignItems="flex-end">
            <TextField
              inputRef={inputRef}
              fullWidth
              multiline
              maxRows={6}
              size="small"
              placeholder="Ej.: Agrega una reunión a las 9:00 hora de España…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              disabled={chatMutation.isPending}
            />
            <IconButton color="primary" onClick={() => send()} disabled={!input.trim() || chatMutation.isPending}>
              <SendIcon />
            </IconButton>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, px: 0.5 }}>
            Enter envía · Shift+Enter nueva línea · cada acción se puede deshacer
          </Typography>
        </Box>
      </Drawer>
    </>
  );
}
