const SPREADSHEET_ID = "COLE_AQUI_O_ID_DA_PLANILHA";
const SHEET_NAME = "Registros";

function doGet(e) {
  try {
    const sheet = getSheet_();
    ensureHeader_(sheet);

    const action = String((e && e.parameter && e.parameter.action) || "total").toLowerCase();

    if (action !== "total") {
      return json_({ ok: false, message: "Ação inválida." });
    }

    return json_({ ok: true, total: getTotal_(sheet) });
  } catch (error) {
    return json_({ ok: false, message: error.message });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    const sheet = getSheet_();
    ensureHeader_(sheet);

    const params = (e && e.parameter) || {};
    const ordemServico = String(params.ordemServico || "").trim();
    const maoObra = Number(String(params.maoObra || "").replace(",", "."));

    if (!ordemServico) {
      throw new Error("Ordem de serviço é obrigatória.");
    }

    if (!Number.isFinite(maoObra) || maoObra < 0) {
      throw new Error("M.O inválida.");
    }

    const nextRow = sheet.getLastRow() + 1;
    sheet.getRange(nextRow, 1, 1, 3).setValues([
      [new Date(), ordemServico, maoObra]
    ]);

    sheet.getRange(nextRow, 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
    sheet.getRange(nextRow, 3).setNumberFormat("0.00");

    return json_({
      ok: true,
      message: "Registro salvo com sucesso.",
      total: getTotal_(sheet),
    });
  } catch (error) {
    return json_({ ok: false, message: error.message });
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

function getSheet_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === "COLE_AQUI_O_ID_DA_PLANILHA") {
    throw new Error("Configure o SPREADSHEET_ID no Apps Script.");
  }

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  return sheet;
}

function ensureHeader_(sheet) {
  const header = ["Data e hora", "Ordem de serviço", "M.O"];

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
    sheet.getRange(1, 1, 1, header.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.getRange("A:A").setNumberFormat("dd/MM/yyyy HH:mm:ss");
    sheet.getRange("C:C").setNumberFormat("0.00");
    return;
  }

  const currentHeader = sheet.getRange(1, 1, 1, header.length).getDisplayValues()[0];
  const headerIsCorrect = header.every((value, index) => currentHeader[index] === value);

  if (!headerIsCorrect) {
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
    sheet.getRange(1, 1, 1, header.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

function getTotal_(sheet) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return "0.00";
  }

  const values = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
  const total = values.reduce((sum, row) => {
    const value = Number(row[0]);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  return total.toFixed(2);
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
