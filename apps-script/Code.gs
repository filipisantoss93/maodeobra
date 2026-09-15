const SPREADSHEET_ID = "COLE_AQUI_O_ID_DA_PLANILHA";
const SHEET_NAME = "Registros";
const TIME_ZONE = "America/Sao_Paulo";

function doGet(e) {
  try {
    const sheet = getSheet_();
    ensureHeader_(sheet);

    const params = (e && e.parameter) || {};
    const action = String(params.action || "resumo").toLowerCase();

    if (action === "historico") {
      const mes = Number(params.mes);
      const ano = Number(params.ano);
      return json_(buildDetailedHistory_(sheet, mes, ano));
    }

    if (action === "resumo" || action === "total") {
      return json_(buildSummary_(sheet));
    }

    return json_({
      sucesso: false,
      ok: false,
      erro: "Ação inválida.",
      message: "Ação inválida."
    });
  } catch (error) {
    return json_({
      sucesso: false,
      ok: false,
      erro: error.message,
      message: error.message
    });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    const sheet = getSheet_();
    ensureHeader_(sheet);

    const params = getPostPayload_(e);
    const ordemServico = String(params.os || params.ordemServico || "").trim();
    const maoObra = Number(String(params.mo || params.maoObra || "").replace(",", "."));

    if (!ordemServico) {
      throw new Error("Ordem de serviço é obrigatória.");
    }

    if (!Number.isFinite(maoObra) || maoObra < 0) {
      throw new Error("M.O inválida.");
    }

    const nextRow = sheet.getLastRow() + 1;
    sheet.getRange(nextRow, 1, 1, 3).setValues([[new Date(), ordemServico, maoObra]]);
    sheet.getRange(nextRow, 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
    sheet.getRange(nextRow, 3).setNumberFormat("0.00");

    return json_({
      sucesso: true,
      ok: true,
      mensagem: "Registro salvo com sucesso.",
      message: "Registro salvo com sucesso."
    });
  } catch (error) {
    return json_({
      sucesso: false,
      ok: false,
      erro: error.message,
      message: error.message
    });
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

function getPostPayload_(e) {
  if (e && e.postData && e.postData.contents) {
    try {
      const parsed = JSON.parse(e.postData.contents);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch (error) {
      // Mantém compatibilidade com envios antigos via formulário.
    }
  }

  return (e && e.parameter) || {};
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

function buildSummary_(sheet) {
  const currentPeriod = getCurrentCycleInfo_();
  const cycles = getHistory_(sheet, currentPeriod.key);
  const current = cycles.find((cycle) => cycle.chave === currentPeriod.key);
  const totalAtual = current ? current.total : "0.00";

  const legacyHistory = cycles.map((cycle) => ({
    key: cycle.chave,
    label: cycle.ciclo,
    total: cycle.total,
    current: cycle.chave === currentPeriod.key
  }));

  return {
    sucesso: true,
    ok: true,
    totalAtual,
    cicloAtual: currentPeriod.label,
    ciclos: cycles,
    total: totalAtual,
    period: {
      key: currentPeriod.key,
      start: currentPeriod.start,
      end: currentPeriod.end,
      label: currentPeriod.label
    },
    history: legacyHistory
  };
}

function buildDetailedHistory_(sheet, endMonth, endYear) {
  if (!Number.isInteger(endMonth) || endMonth < 1 || endMonth > 12) {
    throw new Error("Mês inválido.");
  }

  if (!Number.isInteger(endYear) || endYear < 2000 || endYear > 9999) {
    throw new Error("Ano inválido.");
  }

  const cycleKey = getCycleKeyFromEndMonth_(endMonth, endYear);
  const period = getCycleInfoFromKey_(cycleKey);
  const lastRow = sheet.getLastRow();
  const launches = [];
  let total = 0;

  if (lastRow >= 2) {
    const rows = sheet.getRange(2, 1, lastRow - 1, 3).getValues();

    rows.forEach((row) => {
      const date = row[0];
      const value = Number(row[2]);

      if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return;
      }

      if (getCycleKey_(date) !== cycleKey) {
        return;
      }

      const validValue = Number.isFinite(value) ? value : 0;
      total += validValue;

      launches.push({
        timestamp: date.getTime(),
        data: Utilities.formatDate(date, TIME_ZONE, "dd/MM/yyyy"),
        hora: Utilities.formatDate(date, TIME_ZONE, "HH:mm:ss"),
        os: String(row[1] == null ? "" : row[1]),
        mo: validValue.toFixed(2)
      });
    });
  }

  launches.sort((a, b) => b.timestamp - a.timestamp);

  const cleanLaunches = launches.map((launch) => ({
    data: launch.data,
    hora: launch.hora,
    os: launch.os,
    mo: launch.mo
  }));

  return {
    sucesso: true,
    ok: true,
    periodo: {
      mes: endMonth,
      ano: endYear,
      inicio: period.start,
      fim: period.end,
      label: period.label
    },
    total: total.toFixed(2),
    quantidade: cleanLaunches.length,
    lancamentos: cleanLaunches
  };
}

function getHistory_(sheet, currentCycleKey) {
  const totals = {};
  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    const rows = sheet.getRange(2, 1, lastRow - 1, 3).getValues();

    rows.forEach((row) => {
      const date = row[0];
      const value = Number(row[2]);

      if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return;
      }

      const key = getCycleKey_(date);
      totals[key] = (totals[key] || 0) + (Number.isFinite(value) ? value : 0);
    });
  }

  if (totals[currentCycleKey] === undefined) {
    totals[currentCycleKey] = 0;
  }

  return Object.keys(totals)
    .sort((a, b) => b.localeCompare(a))
    .map((key) => {
      const period = getCycleInfoFromKey_(key);
      return {
        chave: key,
        ciclo: period.label,
        total: totals[key].toFixed(2)
      };
    });
}

function getCycleKeyFromEndMonth_(endMonth, endYear) {
  let startMonth = endMonth - 1;
  let startYear = endYear;

  if (startMonth === 0) {
    startMonth = 12;
    startYear -= 1;
  }

  return `${startYear}-${String(startMonth).padStart(2, "0")}`;
}

function getCycleKey_(date) {
  const localDate = Utilities.formatDate(date, TIME_ZONE, "yyyy-MM-dd");
  const parts = localDate.split("-");
  let year = Number(parts[0]);
  let month = Number(parts[1]);
  const day = Number(parts[2]);

  if (day < 26) {
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }

  return `${year}-${String(month).padStart(2, "0")}`;
}

function getCycleInfoFromKey_(key) {
  const parts = key.split("-");
  const startYear = Number(parts[0]);
  const startMonth = Number(parts[1]);
  const endMonth = startMonth === 12 ? 1 : startMonth + 1;
  const endYear = startMonth === 12 ? startYear + 1 : startYear;
  const start = `26/${String(startMonth).padStart(2, "0")}/${startYear}`;
  const end = `25/${String(endMonth).padStart(2, "0")}/${endYear}`;

  return { key, start, end, label: `${start} a ${end}` };
}

function getCurrentCycleInfo_() {
  return getCycleInfoFromKey_(getCycleKey_(new Date()));
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
