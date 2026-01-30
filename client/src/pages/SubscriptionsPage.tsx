import { useEffect, useState } from 'react';
import {
  Box, Button, Typography, Paper, Table, TableBody, TableCell,
  TableHead, TableRow, IconButton, Dialog, DialogTitle,
  DialogContent, TextField, DialogActions,
  FormControl,
  Select,
  InputAdornment,
  MenuItem,
  type SelectChangeEvent
} from '@mui/material';
import { Delete, Add, Link as LinkIcon, Refresh, OpenInNew, ContentCopy, Dns, Router } from '@mui/icons-material';
import api from '../api';

interface Subscription {
  id: string;
  name: string;
  uuid: string;
  inbounds: any[];
}

interface Tunnel {
  id: number;
  name: string;
  ip: string;
}

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  
  const [selectedServer, setSelectedServer] = useState<string>('main');

  const [linksOpen, setLinksOpen] = useState(false);
  const [currentLinks, setCurrentLinks] = useState<string[]>([]);

  useEffect(() => { loadSubs(); }, []);

  const loadSubs = async () => {
    const { data } = await api.get('/subscriptions');
    setSubs(data);
    const tunnelsRes = await api.get('/tunnels');
    setTunnels(tunnelsRes.data);
  };

  const handleCreate = async () => {
    await api.post('/subscriptions', { name });
    setOpen(false);
    setName('');
    loadSubs();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Удалить подписку и все соединения?')) {
      await api.delete(`/subscriptions/${id}`);
      loadSubs();
    }
  };

  const showLinks = (sub: Subscription) => {
    const links = sub.inbounds?.map(i => i.link).filter(Boolean) || [];
    if (links.length === 0) {
      setCurrentLinks(['Нет активных ссылок (ждите ротации)']);
    } else {
      setCurrentLinks(links);
    }
    setLinksOpen(true);
  };

  const handleServerChange = (event: SelectChangeEvent) => {
    setSelectedServer(event.target.value as string);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Подписки</Typography>
      {tunnels.length > 0 && (
            <FormControl variant='standard' size="small" sx={{ minWidth: 220, justifyContent: 'center' }}>
              <Select
                labelId="server-select-label"
                value={selectedServer}
                onChange={handleServerChange}
                startAdornment={
                  <InputAdornment position="start">
                    {selectedServer === 'main' ? <Dns fontSize="small"/> : <Router fontSize="small"/>}
                  </InputAdornment>
                }
              >
                <MenuItem value="main">
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Основной сервер</Typography>
                  </Box>
                </MenuItem>
                
                {tunnels.map((t) => (
                  <MenuItem key={t.id} value={t.id.toString()}>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{t.name}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        <Box>
          <Button startIcon={<Refresh />} onClick={loadSubs} sx={{ mr: 1 }}>Обновить</Button>
          <Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>Создать</Button>
        </Box>
      </Box>


      <Paper>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Имя</TableCell>
              <TableCell>UUID</TableCell>
              <TableCell>Инбаунды</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {subs.map((sub) => (
              <TableRow key={sub.id}>
                <TableCell>{sub.name}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>{sub.uuid}</TableCell>
                <TableCell>{sub.inbounds?.length || 0}</TableCell>
                <TableCell align="right">
                  <IconButton
                    color="primary"
                    onClick={() => navigator.clipboard.writeText(selectedServer === 'main' ? `http://localhost:3000/bus/${sub.uuid}` : `http://localhost:3000/bus/${sub.uuid}/${selectedServer}`)}
                    title="Копировать ссылку"
                  >
                    <ContentCopy />
                  </IconButton>
                  <IconButton
                    color="primary"
                    onClick={() => window.open(selectedServer === 'main' ? `http://localhost:3000/bus/${sub.uuid}` : `http://localhost:3000/bus/${sub.uuid}/${selectedServer}`, '_blank')}
                    title="Открыть подписку"
                  >
                    <OpenInNew />
                  </IconButton>
                  <IconButton color="primary" onClick={() => showLinks(sub)} title="Показать конфиги">
                    <LinkIcon />
                  </IconButton>
                  <IconButton color="primary" onClick={() => handleDelete(sub.id)} title="Удалить">
                    <Delete />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Новая подписка</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus margin="dense" label="Имя пользователя" fullWidth
            value={name} onChange={(e) => setName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={handleCreate}>Создать</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={linksOpen} onClose={() => setLinksOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Активные ссылки</DialogTitle>
        <DialogContent>
          <TextField
            multiline fullWidth rows={10}
            value={currentLinks.join('\n\n')}
            slotProps={{ input: { readOnly: true, sx: { fontFamily: 'monospace', fontSize: 12 } } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => navigator.clipboard.writeText(currentLinks.join('\n'))}>Копировать всё</Button>
          <Button onClick={() => setLinksOpen(false)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}