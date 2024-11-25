const express = require('express');
const path = require('path');

const app = express();
const port = 8001;
const host = '0.0.0.0';

// Middleware para servir arquivos estáticos da pasta "public"
app.use(express.static(path.join(__dirname, 'public')));

// Rota para servir a página inicial
app.get('/credencial', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'credencial.html'));
});

app.get('/tarefa2', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tarefa2.html'));
});

app.get('/tarefa3', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tarefa3.html'));
});

app.get('/tarefa4', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tarefa4.html'));
});

// Iniciar o servidor
app.listen(port, host, () => {
    console.log(`Servidor rodando em http://${host}:${port}`);
});