const SPREADSHEET_ID = "COLE_AQUI_O_ID_DA_PLANILHA";
const SHEET_NAME = "Registros";
const TIME_ZONE = "America/Sao_Paulo";

function doGet(e) {
  try {
    const sheet = getSheet_();
    ensureHeader_(sheet);

    const action = String((e && e.parameter && e.parameter.action) || "total").toLowerCase();

    if (action !== "total") {
      return json_({ ok: false, message: "Ação inválida." });
    }

    const period = getCurrentCycleInfo_();

    return json_({
      ok: true,
      total: getTotal_(sheet, period.key),
      period,
    });
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

    const period = getCurrentCycleInfo_();

    return json_({
      ok: true,
      message: "Registro salvo com sucesso.",
      total: getTotal_(sheet, period.key),
      period,
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

function getTotal_(sheet, currentCycleKey) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return "0.00";
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 3).getValues();

  const total = rows.reduce((sum, row) => {
    const date = row[0];
    const value = Number(row[2]);

    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return sum;
    }

    if (getCycleKey_(date) !== currentCycleKey) {
      return sum;
    }

    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  return total.toFixed(2);
}

function getCycleKey_(date) {
  const localDate = Utilities.formatDate(date, TIME_ZONE, "yyyy-MM-dd");
  const [yearText, monthText, dayText] = localDate.split("-");

  let year = Number(yearText);
  let month = Number(monthText);
  const day = Number(dayText);

  if (day < 26) {
    month -= 1;

    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }

  return `${year}-${String(month).padStart(2, "0")}`;
}

function getCurrentCycleInfo_() {
  const key = getCycleKey_(new Date());
  const [startYearText, startMonthText] = key.split("-");
  const startYear = Number(startYearText);
  const startMonth = Number(startMonthText);

  const endMonth = startMonth === 12 ? 1 : startMonth + 1;
  const endYear = startMonth === 12 ? startYear + 1 : startYear;

  const start = `26/${String(startMonth).padStart(2, "0")}/${startYear}`;
  const end = `25/${String(endMonth).padStart(2, "0")}/${endYear}`;

  return {
    key,
    start,
    end,
    label: `${start} a ${end}`,
  };
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
