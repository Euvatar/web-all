const express = require('express');
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');
const { google } = require('googleapis');
const cors = require('cors');
const path = require('path');
const https = require('https');
const app = express();
const port = 3000;
const host = '0.0.0.0'; // Aceita conexões de qualquer lugar


app.use(express.json());
app.use(cors());

// Configuração do Multer para armazenar temporariamente o arquivo
const credencial = multer({ dest: 'credencial/' });
const tarefa = multer({ dest: 'tarefa/' });

// Google Drive API e Google Sheets API
const GOOGLE_API_FOLDER_ID = '1KBMTmkvx1WeY7TEBDM-aR_y5goM0GQQJ';
const auth = new google.auth.GoogleAuth({
    keyFile: './google-drive.json', // O arquivo de credenciais do Google Drive
    scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
});

const driveService = google.drive({
    version: 'v3',
    auth
});

const sheetsService = google.sheets({
    version: 'v4',
    auth
});


const sendWhatsAppMessage = async (whatsappNumber, message) => {
    const apiUrl = 'https://api.audiowhats.com.br/message/sendText/WERTcorretores';
    const payload = {
        number: `${whatsappNumber}`,
        options: {
            delay: 1200,
            presence: 'composing'
        },
        textMessage: {
            text: message
        }
    };

    try {
        const response = await axios.post(apiUrl, payload, {
            headers: {
                apikey: '3224c361720733e80b36ed8669f0997c',
                'Content-Type': 'application/json'
            }
        });
        console.log(`Mensagem enviada para ${whatsappNumber}:`, response.data);
    } catch (error) {
        console.error(`Erro ao enviar mensagem para ${whatsappNumber}:`, error.response?.data || error.message);
    }
};
// ID do Google Sheet onde o relatório será salvo
const SPREADSHEET_ID = '1upfOkgWxHKbAwa25_UMdUjCWCvBDb_T3StG1ZmYeYAM';  // Substitua pelo ID da sua planilha

const uploadToPythonApi = async (filePath) => {
    const url = 'http://213.199.37.135:5000/alterarimagem';
    
    const FormData = require('form-data');  // Certifique-se de ter importado a FormData

    // Usamos o FormData para enviar o arquivo como 'multipart/form-data'
    const formData = new FormData();
    formData.append('imagem_principal', fs.createReadStream(filePath));  // Aqui está o arquivo sendo anexado corretamente

    try {
        const response = await axios.post(url, formData, {
            headers: {
                ...formData.getHeaders(),  // Obtém os cabeçalhos corretos para o multipart/form-data
                'Content-Type': 'multipart/form-data',  // Não precisa definir manualmente, o FormData já lida com isso
            },
            responseType: 'arraybuffer'  // A resposta será a imagem transformada
        });

        if (response.status === 200) {
            const resultImagePath = path.join('uploads', 'imagem_resultante.jpg');
            fs.writeFileSync(resultImagePath, response.data);  // Salva a imagem retornada

            console.log('Imagem processada salva como "imagem_resultante.jpg"');

            return resultImagePath;  // Retorna o caminho da imagem processada
        } else {
            console.error(`Erro ao processar a imagem: ${response.status} - ${response.statusText}`);
            throw new Error('Erro ao processar a imagem');
        }
    } catch (error) {
        console.error('Erro ao enviar a imagem para a API Python:', error);
        throw error;
    }
};

const updateGoogleSheet = async (whatsappNumber, deepImageUrl, folderId, imageUrl, name = null) => {
    try {
        // Lê todos os dados da planilha
        const readRequest = {
            spreadsheetId: SPREADSHEET_ID,
            range: 'A:F' // Lê todas as colunas envolvidas
        };
        const readResponse = await sheetsService.spreadsheets.values.get(readRequest);

        // Obtém os dados existentes
        const rows = readResponse.data.values || [];

        // Verifica qual coluna corresponde à pasta
        const folderColumns = {
            'folderId_placeholder': 2,
            'tarefa-2': 3, // Coluna C
            'tarefa-3': 4, // Coluna D
            'tarefa-4': 5  // Coluna E
        };
        const columnIndex = folderColumns[folderId];

        if (!columnIndex) {
            throw new Error(`Pasta inválida: ${folderId}`);
        }

        // Verifica se o número já existe na coluna A
        const rowIndex = rows.findIndex(row => row[0] === whatsappNumber);

        if (rowIndex !== -1) {
            // Atualiza o nome na coluna B
            const updateNameRequest = {
                spreadsheetId: SPREADSHEET_ID,
                range: `B${rowIndex + 1}`, // Referência correta para coluna B (Nome)
                valueInputOption: 'RAW',
                resource: {
                    values: [[name]] // Atualiza o nome
                }
            };
            await sheetsService.spreadsheets.values.update(updateNameRequest);
            console.log(`Nome atualizado para o número ${whatsappNumber}.`);

            // Atualiza a coluna correspondente (onde o imageUrl será armazenado)
            const updateImageRequest = {
                spreadsheetId: SPREADSHEET_ID,
                range: `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`, // Atualiza a célula específica da pasta
                valueInputOption: 'RAW',
                resource: {
                    values: [[imageUrl]] // Atualiza o imageUrl
                }
            };
            await sheetsService.spreadsheets.values.update(updateImageRequest);
            console.log(`Imagem atualizada para o número ${whatsappNumber}.`);
        } else {
            // Se o número não existe, adiciona uma nova linha com os dados
            const newRow = Array(6).fill(''); // Preenche uma nova linha com valores vazios
            newRow[0] = whatsappNumber; // Coluna A (Número)
            newRow[1] = name; // Coluna B (Nome)
            newRow[2] = deepImageUrl; // Coluna C (Deep Image URL)
            newRow[columnIndex] = imageUrl; // Coluna correspondente ao folderId (Tarefa específica)

            const appendRequest = {
                spreadsheetId: SPREADSHEET_ID,
                range: 'A:F',
                valueInputOption: 'RAW',
                resource: {
                    values: [newRow]
                }
            };
            await sheetsService.spreadsheets.values.append(appendRequest);
            console.log(`Nova linha adicionada para o número ${whatsappNumber}.`);
        }
    } catch (error) {
        console.error('Erro ao atualizar o Google Sheets:', error);
    }
};



// Função para baixar o arquivo
const downloadFile = (url, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => resolve(dest));
        }).on('error', (err) => reject(err));
    });
};



// Função para fazer o upload para o Google Drive
const uploadToGoogleDrive = async (filePath, fileName, mimeType) => {
    const fileMetaData = {
        'name': fileName,
        'parents': [GOOGLE_API_FOLDER_ID]
    };

    const media = {
        mimeType: mimeType,
        body: fs.createReadStream(filePath)
    };

    const response = await driveService.files.create({
        resource: fileMetaData,
        media: media,
        fields: 'id, name'
    });

    return response.data.id;  // Retorna o ID do arquivo no Google Drive
};



app.post('/zaia-add-sheet', async (req, res) => {
    const { whatsappNumber ,name } = req.body;


    try {
        // Chama a função para atualizar a planilha
        await updateGoogleSheet(whatsappNumber, "","folderId_placeholder", "", name);
        return res.status(200).send('Dados atualizados com sucesso');
    } catch (error) {
        console.error('Erro ao atualizar a planilha:', error);
        return res.status(500).send('Erro ao atualizar os dados');
    }
});




// Endpoint para atualizar os dados no Google Sheets
app.post('/update-sheet', async (req, res) => {
    const { whatsappNumber, columns } = req.body;

    if (!whatsappNumber || !columns || typeof columns !== 'object') {
        return res.status(400).json({
            message: 'Número do WhatsApp e colunas são obrigatórios. Certifique-se de enviar um objeto de colunas.'
        });
    }

    try {
        // Lê todos os dados da planilha
        const readRequest = {
            spreadsheetId: SPREADSHEET_ID,
            range: 'A:Z' // Lê todas as colunas disponíveis
        };
        const readResponse = await sheetsService.spreadsheets.values.get(readRequest);

        // Obtém as linhas existentes
        const rows = readResponse.data.values || [];

        // Verifica se existem dados na planilha
        if (rows.length === 0) {
            return res.status(404).json({
                message: 'Nenhuma linha encontrada na planilha.'
            });
        }

        // Encontra a linha correspondente ao número do WhatsApp
        const rowIndex = rows.findIndex(row => row[0] === whatsappNumber);

        if (rowIndex !== -1) {
            // Obtém os dados da linha encontrada
            const existingRow = rows[rowIndex];

            // Atualiza os dados da linha com os valores fornecidos
            const updatedRow = [...existingRow];
            for (const [column, value] of Object.entries(columns)) {
                const columnIndex = column.charCodeAt(0) - 65; // Converte 'A', 'B', etc., para índices 0, 1, etc.
                updatedRow[columnIndex] = value;
            }

            // Atualiza a linha na planilha
            const updateRequest = {
                spreadsheetId: SPREADSHEET_ID,
                range: `A${rowIndex + 1}:Z${rowIndex + 1}`,
                valueInputOption: 'RAW',
                resource: {
                    values: [updatedRow]
                }
            };
            await sheetsService.spreadsheets.values.update(updateRequest);

            return res.status(200).json({
                message: `Linha atualizada com sucesso para o número ${whatsappNumber}.`,
                data: updatedRow
            });
        } else {
            // Caso o número não seja encontrado, adiciona uma nova linha
            const newRow = Array(rows[0]?.length || 10).fill('');
            newRow[0] = whatsappNumber;
            for (const [column, value] of Object.entries(columns)) {
                const columnIndex = column.charCodeAt(0) - 65;
                newRow[columnIndex] = value;
            }

            const appendRequest = {
                spreadsheetId: SPREADSHEET_ID,
                range: 'A:Z',
                valueInputOption: 'RAW',
                resource: {
                    values: [newRow]
                }
            };
            await sheetsService.spreadsheets.values.append(appendRequest);

            return res.status(201).json({
                message: `Nova linha adicionada para o número ${whatsappNumber}.`,
                data: newRow
            });
        }
    } catch (error) {
        console.error('Erro ao acessar o Google Sheets:', error);
        res.status(500).json({
            message: 'Erro ao acessar o Google Sheets.',
            error: error.message
        });
    }
});



app.post('/credencial', credencial.single('image'), (req, res) => {
    console.log('Recebendo requisição de upload...');

    if (!req.file) {
        return res.status(400).json({ message: 'Nenhum arquivo foi enviado.' });
    }

    console.log('Arquivo recebido:', req.file); // Verificando o conteúdo do arquivo

    // Verificando se o arquivo é uma imagem
    const validMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/jpg'];
    if (!validMimeTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ message: 'Arquivo inválido. Envie uma imagem.' });
    }

    // Responde imediatamente com 200 OK
    res.status(200).json({ message: 'Processamento iniciado.' });

    // O processamento continua em segundo plano
    (async () => {
        try {
            // Preparando o arquivo para o Google Drive
            const fileMetaData = {
                'name': req.file.originalname,
                'parents': [GOOGLE_API_FOLDER_ID]
            };

            const media = {
                mimeType: req.file.mimetype,
                body: fs.createReadStream(req.file.path)
            };

            // Enviando para o Google Drive
            console.log('Iniciando o upload para o Google Drive...');
            const response = await driveService.files.create({
                resource: fileMetaData,
                media: media,
                fields: 'id, name'
            });

            console.log('Resposta do Google Drive:', response.data);

            // O nome original do arquivo enviado
            const originalFileName = response.data.name;

            // Preparando os dados do corpo do POST para a API deep-image.ai
            const imageUrl = `https://drive.google.com/uc?export=view&id=${response.data.id}`;
            const postData = {
                url: imageUrl,
                width: 1024,
                height: 1024,
                background: {
                    generate: {
                        description: "Take the provided image and maintain all of the person's unique characteristics, adjusting only the nose size to make it slightly smaller. The person is wearing a white t-shirt and is submerged in a pool, looking directly at the camera. Ensure that the person is shown from the waist up, never from below the waist, and the focus is on the upper body, with the calm pool setting and clear blue water around them.",
                        model_type: "realistic",
                        adapter_type: "face",
                        ensure_single_face: true
                    }
                }
            };

            // Enviando para a API de deep-image.ai
            console.log('Enviando URL para a API deep-image.ai...');
            const axiosInstance = axios.create({
                httpsAgent: new https.Agent({
                    rejectUnauthorized: false, // Ignora a validação SSL
                }),
            });
            
            const deepImageResponse = await axiosInstance.post(
                'https://deep-image.ai/rest_api/process_result',
                postData,
                {
                    headers: {
                        'X-API-KEY': '66c56330-a112-11ef-92cb-fffab188408a',
                        'Content-Type': 'application/json',
                    },
                }
            );

            console.log('Resposta da API deep-image.ai:', deepImageResponse.data);

            // Baixando a imagem resultante da API Deep Image
            const resultImageUrl = deepImageResponse.data.result_url;
            const resultImagePath = path.join('uploads', 'deep_result_image.jpg');
            await downloadFile(resultImageUrl, resultImagePath);

            // Enviando a imagem para a API Python
            console.log('Enviando a imagem para a API Python...');
            const processedImagePath = await uploadToPythonApi(resultImagePath);

            // Salvando a imagem retornada pela API Python no Google Drive
            const finalImagePath = path.join('uploads', 'final_image.jpg');
            fs.writeFileSync(finalImagePath, fs.readFileSync(processedImagePath)); // Salva a imagem recebida

            // Fazendo upload da imagem final para o Google Drive
            const finalImageId = await uploadToGoogleDrive(finalImagePath, `${originalFileName.split('.')[0]}_final.jpg`, 'image/jpeg');
            console.log('Imagem transformada enviada para o Google Drive com ID:', finalImageId);
            
            // Excluindo os arquivos temporários
            fs.unlinkSync(req.file.path);
            fs.unlinkSync(resultImagePath);
            fs.unlinkSync(finalImagePath);

            // Retorna a URL do resultado no Google Drive
            const finalImageUrl = `https://drive.google.com/uc?export=view&id=${finalImageId}`;

            await updateGoogleSheet(originalFileName.split('_')[1].split('.')[0], imageUrl, 'folderId_placeholder', finalImageUrl, originalFileName.split('_')[0]);
            await sendWhatsAppMessage(originalFileName.split('_')[1].split('.')[0], 'Parabéns! Você acabou de receber 10 pontos no programa de pontuação All Wert. 🚀 Sua foto foi enviada para o credenciamento. Em breve, você receberá o seu acesso ao evento!');

        } catch (err) {
            console.log('Erro no processo:', err);
        }
    })();
});


const folderIds = {
    'tarefa-1': '1KBMTmkvx1WeY7TEBDM-aR_y5goM0GQQJ',
    'tarefa-2': '1s3zMaOkBC8OnECt-qBJeiSte_7rb88G-',
    'tarefa-3': '1XmwdqUiCjyk-cSo0B36aBNHpA94B9HUW',
    
};

// Endpoint para upload de imagem de tarefa
app.post('/tarefa', tarefa.single('image'), async (req, res) => {
    const { folderId, whatsappNumber } = req.body;  // Obtém o ID da pasta e o número de WhatsApp da requisição

    if (!folderIds[folderId]) {
        return res.status(400).json({ message: 'Pasta não válida.' });
    }

    if (!whatsappNumber) {
        return res.status(400).json({ message: 'Número do WhatsApp não fornecido.' });
    }

    if (!req.file) {
        return res.status(400).json({ message: 'Nenhum arquivo foi enviado.' });
    }

    // Verifique se `folderId` está correto antes de prosseguir
    console.log('FolderId recebido:', folderId); // Adicione este log para depurar

    const fileMetaData = {
        'name': `${whatsappNumber}.jpg`,  // Nome da imagem será o número de WhatsApp
        'parents': [folderIds[folderId]]  // Usando o ID da pasta correspondente
    };

    const media = {
        mimeType: req.file.mimetype,
        body: fs.createReadStream(req.file.path)
    };

    try {
        // Fazendo o upload para o Google Drive
        const response = await driveService.files.create({
            resource: fileMetaData,
            media: media,
            fields: 'id, name'
        });

        // URL do arquivo no Google Drive
        const imageUrl = `https://drive.google.com/uc?export=view&id=${response.data.id}`;

        // Atualiza o Google Sheets com o relatório da tarefa
        await updateGoogleSheet(whatsappNumber, 'Deep Image URL here', folderId, imageUrl);
        
        if (folderId == 'tarefa-2'){
            pontuacao = '35'
            await sendWhatsAppMessage(whatsappNumber, `${folderId} recebida com sucesso. Parabéns, ${pontuacao} pontos registrados!`)

        }
        if (folderId == 'tarefa-3'){
            pontuacao = '55'
            await sendWhatsAppMessage(whatsappNumber, `${folderId} recebida com sucesso. Parabéns, ${pontuacao} pontos registrados!`)

        }
        if (folderId == 'tarefa-4'){
            await sendWhatsAppMessage(whatsappNumber, `${folderId} recebida com sucesso.!`)

        }

        


        // Retorna o link da imagem com o número do WhatsApp como nome
        res.json({ link: imageUrl });

    } catch (err) {
        console.log('Erro ao enviar para o Google Drive:', err);
        res.status(500).json({ message: 'Erro ao enviar a tarefa' });
    }
});





app.listen(port, host, () => {
    console.log(`Servidor rodando em http://${host}:${port}`);
});
