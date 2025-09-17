import React, { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Stack,
  Button,
  Divider,
  Chip,
  LinearProgress,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Alert,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { planningApi } from '../services/api';
import type { ProductivityReport } from '../types';
import {
  QueryStats as StatsIcon,
  Today as TodayIcon,
  CalendarMonth as MonthIcon,
  DateRange as RangeIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function toISO(d: dayjs.Dayjs) {
  return d.format('YYYY-MM-DD');
}

export default function Reports() {
  const [startDate, setStartDate] = useState(dayjs().startOf('week'));
  const [endDate, setEndDate] = useState(dayjs().endOf('week'));

  const { data: report, isLoading, isError } = useQuery<ProductivityReport>({
    queryKey: ['productivityReport', toISO(startDate), toISO(endDate)],
    queryFn: () => planningApi.getReport(toISO(startDate), toISO(endDate)),
  });

  const summaries = useMemo(() => {
    const average = report?.averageProductivity ?? 0;
    const plannedTime = report?.totalPlannedTime ?? 0;
    const actualTime = report?.totalActualTime ?? 0;
    const totalDays = report?.totalDays ?? 0;
    const plannedTasks = report?.totalPlannedTasks ?? 0;
    const completedTasks = report?.totalCompletedTasks ?? 0;
    return { average, plannedTime, actualTime, totalDays, plannedTasks, completedTasks };
  }, [report]);

  const handlePreset = (preset: 'today' | 'week' | 'month' | 'last7' | 'last30') => {
    const now = dayjs();
    switch (preset) {
      case 'today':
        setStartDate(now.startOf('day'));
        setEndDate(now.endOf('day'));
        break;
      case 'week':
        setStartDate(now.startOf('week'));
        setEndDate(now.endOf('week'));
        break;
      case 'month':
        setStartDate(now.startOf('month'));
        setEndDate(now.endOf('month'));
        break;
      case 'last7':
        setStartDate(now.subtract(6, 'day').startOf('day'));
        setEndDate(now.endOf('day'));
        break;
      case 'last30':
        setStartDate(now.subtract(29, 'day').startOf('day'));
        setEndDate(now.endOf('day'));
        break;
    }
  };

  const downloadCsv = () => {
    if (!report) return;
    const headers = ['Date', 'Day Type', 'Score', 'Planned Time (min)', 'Actual Time (min)', 'Completed Tasks'];
    const rows = (report.dailyStats || []).map(d => [
      d.date,
      d.dayType,
      String(d.productivity?.score ?? ''),
      String(d.productivity?.planned?.totalTime ?? ''),
      String(d.productivity?.actual?.totalTime ?? ''),
      String(d.productivity?.actual?.completedTasks ?? ''),
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `productivity-report_${toISO(startDate)}_${toISO(endDate)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h4">Productivity Reports</Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          <DatePicker label="Start" value={startDate} onChange={(d) => d && setStartDate(d)} format="MM/DD/YYYY" />
          <DatePicker label="End" value={endDate} onChange={(d) => d && setEndDate(d)} format="MM/DD/YYYY" />
          <Button variant="outlined" size="small" startIcon={<TodayIcon />} onClick={() => handlePreset('today')}>Today</Button>
          <Button variant="outlined" size="small" startIcon={<RangeIcon />} onClick={() => handlePreset('last7')}>Last 7d</Button>
          <Button variant="outlined" size="small" startIcon={<RangeIcon />} onClick={() => handlePreset('last30')}>Last 30d</Button>
          <Button variant="outlined" size="small" startIcon={<MonthIcon />} onClick={() => handlePreset('month')}>This Month</Button>
          <Button variant="contained" size="small" startIcon={<DownloadIcon />} onClick={downloadCsv} disabled={!report}>Export CSV</Button>
        </Stack>
      </Box>

      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>Failed to load report. Please adjust the date range and try again.</Alert>
      )}

      {/* Summary cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Average Productivity</Typography>
              <Typography variant="h4" sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                {summaries.average?.toFixed(0) || 0}%
                <Chip size="small" color={summaries.average >= 80 ? 'success' : summaries.average >= 50 ? 'warning' : 'error'} label={summaries.average >= 80 ? 'Great' : summaries.average >= 50 ? 'OK' : 'Low'} />
              </Typography>
              <LinearProgress variant="determinate" value={Math.min(100, summaries.average || 0)} sx={{ mt: 1 }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Planned vs Actual Time</Typography>
              <Stack direction="row" spacing={3} alignItems="center" sx={{ mt: 1 }}>
                <Box>
                  <Typography variant="h5">{formatMinutes(summaries.plannedTime)}</Typography>
                  <Typography variant="caption" color="text.secondary">Planned</Typography>
                </Box>
                <Divider flexItem orientation="vertical" />
                <Box>
                  <Typography variant="h5">{formatMinutes(summaries.actualTime)}</Typography>
                  <Typography variant="caption" color="text.secondary">Actual</Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Tasks</Typography>
              <Stack direction="row" spacing={3} alignItems="center" sx={{ mt: 1 }}>
                <Box>
                  <Typography variant="h5">{summaries.plannedTasks}</Typography>
                  <Typography variant="caption" color="text.secondary">Planned</Typography>
                </Box>
                <Divider flexItem orientation="vertical" />
                <Box>
                  <Typography variant="h5">{summaries.completedTasks}</Typography>
                  <Typography variant="caption" color="text.secondary">Completed</Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Days</Typography>
              <Typography variant="h4">{summaries.totalDays}</Typography>
              <Typography variant="caption" color="text.secondary">in range</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Daily trend */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <StatsIcon color="primary" />
            <Typography variant="h6">Daily Productivity Trend</Typography>
          </Box>
          <Paper variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Day Type</TableCell>
                  <TableCell>Score</TableCell>
                  <TableCell align="right">Planned</TableCell>
                  <TableCell align="right">Actual</TableCell>
                  <TableCell align="right">Completed Tasks</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary">Loading...</Typography>
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && report && report.dailyStats && report.dailyStats.length > 0 && report.dailyStats.map((d) => {
                  const score = Math.min(100, Math.max(0, d.productivity?.score ?? 0));
                  const planned = d.productivity?.planned?.totalTime ?? 0;
                  const actual = d.productivity?.actual?.totalTime ?? 0;
                  const completed = d.productivity?.actual?.completedTasks ?? 0;
                  return (
                    <TableRow key={d.date} hover>
                      <TableCell>{dayjs(d.date).format('MMM D, YYYY')}</TableCell>
                      <TableCell>
                        <Chip size="small" label={d.dayType} color={d.dayType === 'workday' ? 'primary' : d.dayType === 'weekend' ? 'default' : 'warning'} />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 180 }}>
                          <Box sx={{ flex: 1 }}>
                            <LinearProgress variant="determinate" value={score} sx={{ height: 8, borderRadius: 4 }} />
                          </Box>
                          <Typography variant="caption" sx={{ width: 36, textAlign: 'right' }}>{score.toFixed(0)}%</Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">{formatMinutes(planned)}</TableCell>
                      <TableCell align="right">{formatMinutes(actual)}</TableCell>
                      <TableCell align="right">{completed}</TableCell>
                    </TableRow>
                  );
                })}
                {!isLoading && (!report || !report.dailyStats || report.dailyStats.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary">No data for the selected period.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </CardContent>
      </Card>
    </Box>
  );
}
