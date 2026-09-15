# Mão de Obra

Página simples para registrar mão de obra em uma planilha do Google Sheets usando Google Apps Script.

## Dados registrados

A aba `Registros` recebe três colunas:

1. `Data e hora` — preenchida automaticamente no momento do registro.
2. `Ordem de serviço` — informada na página.
3. `M.O` — informada na página e formatada como `0.00`.

A página também exibe a soma acumulada da coluna `M.O`.

## 1. Criar a planilha

Crie uma planilha no Google Sheets. O script cria automaticamente a aba `Registros` e os cabeçalhos na primeira utilização.

Na URL da planilha:

```text
https://docs.google.com/spreadsheets/d/ID_DA_PLANILHA/edit
```

copie apenas o trecho `ID_DA_PLANILHA`.

## 2. Configurar o Apps Script

1. Abra o Google Apps Script.
2. Crie um projeto.
3. Copie o conteúdo de `apps-script/Code.gs` para o arquivo `Code.gs` do projeto.
4. Substitua:

```javascript
const SPREADSHEET_ID = "COLE_AQUI_O_ID_DA_PLANILHA";
```

pelo ID da sua planilha.

5. Nas configurações do projeto, use o fuso horário `America/Sao_Paulo`.

## 3. Publicar como Web App

No Apps Script:

1. Clique em **Implantar > Nova implantação**.
2. Escolha **Aplicativo da Web**.
3. Executar como: **Eu**.
4. Quem pode acessar: **Qualquer pessoa**.
5. Autorize o projeto e copie a URL terminada em `/exec`.

## 4. Conectar a página

No arquivo `app.js`, substitua:

```javascript
const APPS_SCRIPT_URL = "";
```

por:

```javascript
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/SEU_DEPLOYMENT_ID/exec";
```

Depois disso, a página estará pronta para registrar dados e consultar o total acumulado de M.O.

## Interface

- Campo **Ordem de serviço**
- Campo **Quantidade de M.O**
- Botão **REGISTRAR**
- Total acumulado de M.O
- Layout responsivo com identidade em azul-marinho
