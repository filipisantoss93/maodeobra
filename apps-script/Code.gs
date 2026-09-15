const SPREADSHEET_ID = "COLE_AQUI_O_ID_DA_PLANILHA";
const NOME_ABA = "Registros";
const TIME_ZONE = "America/Sao_Paulo";

function doGet(e) {
  try {
    const parametros = (e && e.parameter) || {};
    const action = String(parametros.action || "resumo").toLowerCase();

    const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);
    const aba = obterAba_(planilha);

    if (action === "historico") {
      const mes = Number(parametros.mes);
      const ano = Number(parametros.ano);

      return resposta({
        ...buscarHistoricoDetalhado(aba, mes, ano),
        ok: true
      });
    }

    if (action === "resumo" || action === "total") {
      const resumo = gerarResumo(aba);
      return resposta({
        ...resumo,
        ok: true,
        total: resumo.totalAtual,
        history: resumo.ciclos.map((item) => ({
          label: item.ciclo,
          total: item.total,
          current: item.ciclo === resumo.cicloAtual
        }))
      });
    }

    return resposta({
      sucesso: false,
      ok: false,
      erro: "Ação inválida.",
      message: "Ação inválida."
    });

  } catch (erro) {
    return resposta({
      sucesso: false,
      ok: false,
      erro: erro.message,
      message: erro.message
    });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);
    const aba = obterAba_(planilha);

    let dados = {};

    if (e && e.postData && e.postData.contents) {
      try {
        dados = JSON.parse(e.postData.contents);
      } catch (erro) {
        dados = (e && e.parameter) || {};
      }
    } else {
      dados = (e && e.parameter) || {};
    }

    const agora = new Date();
    const os = String(dados.os || dados.ordemServico || "").trim();
    const valorMO = String(dados.mo ?? dados.maoObra ?? "")
      .trim()
      .replace(",", ".");
    const mo = Number(valorMO);

    if (!os) {
      throw new Error("Informe a Ordem de Serviço.");
    }

    if (!Number.isFinite(mo) || mo < 0) {
      throw new Error("Valor de M.O inválido.");
    }

    const ciclo = calcularCiclo(agora);

    aba.appendRow([
      agora,
      os,
      mo,
      ciclo
    ]);

    const ultimaLinha = aba.getLastRow();

    aba.getRange(ultimaLinha, 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
    aba.getRange(ultimaLinha, 3).setNumberFormat("0.00");

    return resposta({
      sucesso: true,
      ok: true,
      mensagem: "Registro salvo com sucesso.",
      message: "Registro salvo com sucesso.",
      ciclo
    });

  } catch (erro) {
    return resposta({
      sucesso: false,
      ok: false,
      erro: erro.message,
      message: erro.message
    });

  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

function obterAba_(planilha) {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === "COLE_AQUI_O_ID_DA_PLANILHA") {
    throw new Error("Configure o SPREADSHEET_ID no Apps Script.");
  }

  let aba = planilha.getSheetByName(NOME_ABA);

  if (!aba) {
    aba = planilha.insertSheet(NOME_ABA);
  }

  if (aba.getLastRow() === 0) {
    aba.appendRow([
      "Data e Hora",
      "Ordem de Serviço",
      "M.O",
      "Ciclo"
    ]);
  }

  aba.setFrozenRows(1);
  aba.getRange("A:A").setNumberFormat("dd/MM/yyyy HH:mm:ss");
  aba.getRange("C:C").setNumberFormat("0.00");

  return aba;
}

function gerarResumo(aba) {
  const cicloAtual = calcularCiclo(new Date());

  if (!aba || aba.getLastRow() < 2) {
    return {
      sucesso: true,
      totalAtual: "0.00",
      cicloAtual,
      ciclos: []
    };
  }

  const dados = aba
    .getRange(2, 1, aba.getLastRow() - 1, 3)
    .getValues();

  const totais = {};

  dados.forEach((linha) => {
    const data = linha[0];

    if (!(data instanceof Date) || Number.isNaN(data.getTime())) {
      return;
    }

    const mo = Number(linha[2]);
    const valor = Number.isFinite(mo) ? mo : 0;
    const ciclo = calcularCiclo(data);

    if (!totais[ciclo]) {
      totais[ciclo] = {
        total: 0,
        timestamp: obterInicioCicloTimestamp(data)
      };
    }

    totais[ciclo].total += valor;
  });

  const ciclos = Object.keys(totais)
    .map((ciclo) => ({
      ciclo,
      total: totais[ciclo].total.toFixed(2),
      timestamp: totais[ciclo].timestamp
    }))
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((item) => ({
      ciclo: item.ciclo,
      total: item.total
    }));

  return {
    sucesso: true,
    cicloAtual,
    totalAtual: totais[cicloAtual]
      ? totais[cicloAtual].total.toFixed(2)
      : "0.00",
    ciclos
  };
}

function buscarHistoricoDetalhado(aba, mes, ano) {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error("Mês inválido.");
  }

  if (!Number.isInteger(ano) || ano < 2000 || ano > 9999) {
    throw new Error("Ano inválido.");
  }

  const periodo = obterPeriodoPorMesAno(mes, ano);
  const chaveSelecionada = obterChaveCicloPorMesAno_(mes, ano);

  if (!aba || aba.getLastRow() < 2) {
    return {
      sucesso: true,
      periodo,
      total: "0.00",
      quantidade: 0,
      lancamentos: []
    };
  }

  const dados = aba
    .getRange(2, 1, aba.getLastRow() - 1, 3)
    .getValues();

  const lancamentos = [];
  let total = 0;

  dados.forEach((linha) => {
    const data = linha[0];

    if (!(data instanceof Date) || Number.isNaN(data.getTime())) {
      return;
    }

    if (obterChaveCicloDaData_(data) !== chaveSelecionada) {
      return;
    }

    const moBruto = Number(linha[2]);
    const mo = Number.isFinite(moBruto) ? moBruto : 0;

    total += mo;

    lancamentos.push({
      timestamp: data.getTime(),
      data: Utilities.formatDate(data, TIME_ZONE, "dd/MM/yyyy"),
      hora: Utilities.formatDate(data, TIME_ZONE, "HH:mm:ss"),
      os: String(linha[1] ?? ""),
      mo: mo.toFixed(2)
    });
  });

  lancamentos.sort((a, b) => b.timestamp - a.timestamp);

  return {
    sucesso: true,
    periodo,
    total: total.toFixed(2),
    quantidade: lancamentos.length,
    lancamentos: lancamentos.map((item) => ({
      data: item.data,
      hora: item.hora,
      os: item.os,
      mo: item.mo
    }))
  };
}

function obterPeriodoPorMesAno(mes, ano) {
  const chave = obterChaveCicloPorMesAno_(mes, ano);
  return obterPeriodoPorChave_(chave, mes, ano);
}

function obterChaveCicloPorMesAno_(mesFinal, anoFinal) {
  let mesInicio = mesFinal - 1;
  let anoInicio = anoFinal;

  if (mesInicio === 0) {
    mesInicio = 12;
    anoInicio -= 1;
  }

  return `${anoInicio}-${String(mesInicio).padStart(2, "0")}`;
}

function obterChaveCicloDaData_(data) {
  const partes = Utilities.formatDate(data, TIME_ZONE, "yyyy-MM-dd").split("-");

  let ano = Number(partes[0]);
  let mes = Number(partes[1]);
  const dia = Number(partes[2]);

  if (dia <= 25) {
    mes -= 1;

    if (mes === 0) {
      mes = 12;
      ano -= 1;
    }
  }

  return `${ano}-${String(mes).padStart(2, "0")}`;
}

function obterPeriodoPorChave_(chave, mesFinal, anoFinal) {
  const partes = chave.split("-");
  const anoInicio = Number(partes[0]);
  const mesInicio = Number(partes[1]);

  const inicio = `26/${String(mesInicio).padStart(2, "0")}/${anoInicio}`;
  const fim = `25/${String(mesFinal).padStart(2, "0")}/${anoFinal}`;

  return {
    mes: mesFinal,
    ano: anoFinal,
    inicio,
    fim,
    label: `${inicio} a ${fim}`
  };
}

function calcularCiclo(data) {
  const chave = obterChaveCicloDaData_(data);
  const partes = chave.split("-");
  const anoInicio = Number(partes[0]);
  const mesInicio = Number(partes[1]);

  const mesFim = mesInicio === 12 ? 1 : mesInicio + 1;
  const anoFim = mesInicio === 12 ? anoInicio + 1 : anoInicio;

  const inicio = `26/${String(mesInicio).padStart(2, "0")}/${anoInicio}`;
  const fim = `25/${String(mesFim).padStart(2, "0")}/${anoFim}`;

  return `${inicio} a ${fim}`;
}

function obterInicioCicloTimestamp(data) {
  const chave = obterChaveCicloDaData_(data);
  const partes = chave.split("-");

  return new Date(
    Number(partes[0]),
    Number(partes[1]) - 1,
    26
  ).getTime();
}

function resposta(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
