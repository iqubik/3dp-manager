import axios from 'axios';

const api = axios.create({
  baseURL: `http://${location.hostname}:3000/api`, 
});

export default api;