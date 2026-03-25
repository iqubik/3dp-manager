import React, { useEffect, useRef, useState } from 'react';
import { Box, TextField, Button, Typography, List, ListItem, ListItemText, IconButton, Paper, TablePagination, useTheme, useMediaQuery, Alert, Stack, CircularProgress, Divider, Link as MuiLink, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import { Delete, Add, UploadFile, Remove, ExpandMore } from '@mui/icons-material';
import api from '../api';

interface Domain { id: number; name: string; }
interface ScanCapabilities {
  scannerAvailable: boolean;
  scannerPath: string | null;
  timeoutAvailable: boolean;
  timeoutPath: string | null;
}
interface ScanResponse {
  addr: string;
  scanSeconds: number;
  thread: number;
  timeout: number;
  timedOut: boolean;
  exitCode: number;
  foundCount: number;
  domains: string[];
  stderrTail: string;
  stdoutTail: string;
}

const SCAN_STORAGE_KEY = 'domains_scan_state_v1';

export default function DomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [totalCount, setTotalCount] = useState(0);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [scanCapabilities, setScanCapabilities] = useState<ScanCapabilities | null>(null);
  const [scanAddr, setScanAddr] = useState('');
  const [scanSeconds, setScanSeconds] = useState(30);
  const [scanThread, setScanThread] = useState(2);
  const [scanTimeout, setScanTimeout] = useState(5);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [scanCandidates, setScanCandidates] = useState<string[]>([]);
  const [scanPanelExpanded, setScanPanelExpanded] = useState(false);
  const [scanStateHydrated, setScanStateHydrated] = useState(false);

  const loadDomains = async () => {
    try {
      const { data } = await api.get(`/domains?page=${page + 1}&limit=${rowsPerPage}`);

      setDomains(data.data);
      setTotalCount(data.total);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadDomains();
  }, [page, rowsPerPage]);

  useEffect(() => {
    const loadScannerContext = async () => {
      try {
        const capRes = await api.get('/domains/scan/capabilities');
        setScanCapabilities(capRes.data);
      } catch (e) {
        console.error(e);
      }

      try {
        const settingsRes = await api.get('/settings');
        const defaultAddr = settingsRes.data?.xui_ip || settingsRes.data?.xui_host || '';
        if (defaultAddr) {
          setScanAddr((prev) => (prev.trim() ? prev : defaultAddr));
        }
      } catch (e) {
        console.error(e);
      }
    };

    loadScannerContext();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SCAN_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as {
        scanAddr?: string;
        scanSeconds?: number;
        scanThread?: number;
        scanTimeout?: number;
        scanResult?: ScanResponse | null;
        scanCandidates?: string[];
        scanPanelExpanded?: boolean;
      };

      if (typeof parsed.scanAddr === 'string' && parsed.scanAddr.trim()) setScanAddr(parsed.scanAddr);
      if (typeof parsed.scanSeconds === 'number') setScanSeconds(parsed.scanSeconds);
      if (typeof parsed.scanThread === 'number') setScanThread(parsed.scanThread);
      if (typeof parsed.scanTimeout === 'number') setScanTimeout(parsed.scanTimeout);
      if (parsed.scanResult) setScanResult(parsed.scanResult);
      if (Array.isArray(parsed.scanCandidates)) setScanCandidates(parsed.scanCandidates);
      if (typeof parsed.scanPanelExpanded === 'boolean') setScanPanelExpanded(parsed.scanPanelExpanded);
    } catch (e) {
      console.error(e);
    } finally {
      setScanStateHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!scanStateHydrated) return;

    try {
      localStorage.setItem(
        SCAN_STORAGE_KEY,
        JSON.stringify({
          scanAddr,
          scanSeconds,
          scanThread,
          scanTimeout,
          scanResult,
          scanCandidates,
          scanPanelExpanded,
        }),
      );
    } catch (e) {
      console.error(e);
    }
  }, [scanAddr, scanSeconds, scanThread, scanTimeout, scanResult, scanCandidates, scanPanelExpanded, scanStateHydrated]);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleAdd = async () => {
    if (!newDomain) return;
    await api.post('/domains', { name: newDomain });
    setNewDomain('');
    loadDomains();
  };

  const handleDelete = async (id: number) => {
    await api.delete(`/domains/${id}`);
    loadDomains();
  };

  const handleDeleteAll = async () => {
    if (confirm('ВНИМАНИЕ! Вы действительно хотите удалить ВСЕ домены из белого списка?')) {
      try {
        await api.delete('/domains/all');
        loadDomains();
      } catch (_e) { alert('Ошибка удаления'); }
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/);

      try {
        const { data } = await api.post('/domains/upload', { domains: lines });
        alert(`Успешно добавлено доменов: ${data.count}`);
        loadDomains();
      } catch (_err) {
        alert('Ошибка при загрузке списка');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleStartScan = async () => {
    if (!scanAddr.trim()) {
      alert('Укажите IP/домен для сканирования');
      return;
    }

    try {
      setIsScanning(true);
      setScanError('');
      setScanResult(null);

      const { data } = await api.post('/domains/scan/start', {
        addr: scanAddr.trim(),
        scanSeconds,
        thread: scanThread,
        timeout: scanTimeout,
      });

      setScanResult(data);
      setScanCandidates(data.domains || []);
    } catch (e: any) {
      const message = e?.response?.data?.message || e?.message || 'Ошибка запуска сканера';
      setScanError(Array.isArray(message) ? message.join('; ') : message);
    } finally {
      setIsScanning(false);
    }
  };

  const handleImportScannedDomains = async () => {
    const found = scanCandidates;
    if (found.length === 0) return;

    try {
      const { data } = await api.post('/domains/upload', { domains: found });
      alert(`Скан завершен. Добавлено новых доменов: ${data.count}`);
      loadDomains();
    } catch (_e) {
      alert('Ошибка импорта найденных доменов');
    }
  };

  const handleRemoveScannedDomain = (domain: string) => {
    setScanCandidates((prev) => prev.filter((d) => d !== domain));
  };

  const handleClearScannedDomains = () => {
    setScanCandidates([]);
    setScanResult(null);
  };

  return (
    <Box>
      <Typography variant={isMobile ? 'h5' : 'h4'} gutterBottom>Белый список доменов (SNI)</Typography>

      <Paper sx={{ mb: 2 }}>
        <Accordion
          expanded={scanPanelExpanded}
          onChange={(_event, expanded) => setScanPanelExpanded(expanded)}
          disableGutters
          sx={{
            boxShadow: 'none',
            '&:before': { display: 'none' },
          }}
        >
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography variant='h6'>Автопоиск SNI (backend scanner)</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 2, pb: 2 }}>

        {scanCapabilities && (!scanCapabilities.scannerAvailable || !scanCapabilities.timeoutAvailable) && (
          <Alert severity='warning' sx={{ mb: 2 }}>
            Сканер в контейнере недоступен. scanner: {String(scanCapabilities.scannerAvailable)}, timeout: {String(scanCapabilities.timeoutAvailable)}
          </Alert>
        )}

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            label='IP/домен VPS'
            value={scanAddr}
            onChange={(e) => setScanAddr(e.target.value)}
            fullWidth
            size='small'
          />
          <TextField
            label='Секунд скана'
            type='number'
            value={scanSeconds}
            onChange={(e) => setScanSeconds(Number(e.target.value))}
            size='small'
            sx={{ minWidth: 140 }}
          />
          <TextField
            label='Потоков'
            type='number'
            value={scanThread}
            onChange={(e) => setScanThread(Number(e.target.value))}
            size='small'
            sx={{ minWidth: 120 }}
          />
          <TextField
            label='Таймаут'
            type='number'
            value={scanTimeout}
            onChange={(e) => setScanTimeout(Number(e.target.value))}
            size='small'
            sx={{ minWidth: 120 }}
          />
        </Stack>

        <Stack direction='row' spacing={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
          <Button variant='contained' onClick={handleStartScan} disabled={isScanning}>
            {isScanning ? 'Сканирование...' : 'Сканировать'}
          </Button>
          <Button
            variant='outlined'
            onClick={handleImportScannedDomains}
            disabled={!scanResult || scanCandidates.length === 0 || isScanning}
          >
            Добавить найденные в список
          </Button>
          <Button
            variant='text'
            color='error'
            onClick={handleClearScannedDomains}
            disabled={scanCandidates.length === 0 && !scanResult}
          >
            Очистить предварительный
          </Button>
          {isScanning && <CircularProgress size={24} />}
        </Stack>

        {scanError && <Alert severity='error' sx={{ mt: 2 }}>{scanError}</Alert>}

        {scanResult && (
          <Box sx={{ mt: 2 }}>
            <Divider sx={{ mb: 2 }} />
            <Typography variant='body2' sx={{ mb: 1 }}>
              Найдено: <b>{scanResult.foundCount}</b>. К отбору: <b>{scanCandidates.length}</b>. Код выхода: <b>{scanResult.exitCode}</b>. Таймаут: <b>{String(scanResult.timedOut)}</b>
            </Typography>
            <Alert severity='info' sx={{ mb: 1 }}>
              Можно открыть домен в новом окне, проверить вручную и удалить из предварительного списка перед импортом.
            </Alert>
            <Paper variant='outlined' sx={{ maxHeight: 220, overflow: 'auto' }}>
              <List dense>
                {scanCandidates.map((d) => (
                  <ListItem
                    key={d}
                    sx={{
                      borderRadius: 1,
                      transition: 'background-color 120ms ease',
                      '&:hover': {
                        backgroundColor: 'action.hover',
                      },
                    }}
                    secondaryAction={
                      <IconButton edge='end' onClick={() => handleRemoveScannedDomain(d)}>
                        <Delete />
                      </IconButton>
                    }
                  >
                    <ListItemText
                      primary={
                        <MuiLink href={`https://${d}`} target='_blank' rel='noopener noreferrer' underline='hover'>
                          {d}
                        </MuiLink>
                      }
                    />
                  </ListItem>
                ))}
                {scanCandidates.length === 0 && (
                  <ListItem>
                    <ListItemText primary='Домены не найдены' />
                  </ListItem>
                )}
              </List>
            </Paper>
          </Box>
        )}
          </AccordionDetails>
        </Accordion>
      </Paper>

      <Paper sx={{ p: 2, display: 'flex', gap: 2 }}>
        <TextField
          label="Доменное имя" size="small" fullWidth
          value={newDomain} onChange={(e) => setNewDomain(e.target.value)}
        />
        {isMobile ? (
          <>
            <IconButton edge="end" onClick={() => fileInputRef.current?.click()}><UploadFile /></IconButton>
            <IconButton edge="end" onClick={handleAdd}><Add /></IconButton>
          </>
        ) : (
          <>
            <Button
              variant="outlined"
              startIcon={<UploadFile />}
              sx={{ width: isMobile ? 'auto' : '170px' }}
              onClick={() => fileInputRef.current?.click()}
            >
              {isMobile ? '' : 'Из файла'}
            </Button>
            <Button variant="contained" sx={{ width: '160px' }} startIcon={<Add />} onClick={handleAdd}>Добавить</Button>
          </>
        )}
        <input
          type="file"
          accept=".txt"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
      </Paper>

      {domains.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'end', width: '100%' }}>
          <Button
            variant="text"
            color="error"
            size='small'
            startIcon={<Remove />}
            onClick={handleDeleteAll}
          >
            Удалить все
          </Button>
        </Box>
      )}

      <Paper sx={{ mt: domains.length > 0 ? 0 : 3 }}>
        <List>
          {domains.map((d) => (
            <ListItem key={d.id} secondaryAction={
              <IconButton edge="end" onClick={() => handleDelete(d.id)}><Delete /></IconButton>
            }>
              <ListItemText primary={d.name} />
            </ListItem>
          ))}
          {domains.length === 0 && <Typography sx={{ p: 2 }} color='textSecondary' textAlign='center'>Нет доменов</Typography>}
        </List>
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[10, 25, 50, 100]}
          labelRowsPerPage="Доменов на странице:"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} из ${count !== -1 ? count : `более ${to}`}`}
        />
      </Paper>
    </Box>
  );
}
