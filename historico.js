const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyXN2y03f4L8cRwLXePmqubpHFYCTyn54kfr3YBKS13JCxYuX5OAa9v-_X92bDVpJ18/exec";

const form = document.querySelector("#historico-form");
const mesSelect = document.querySelector("#mes");
const anoSelect = document.querySelector("#ano");
const buscarButton = document.querySelector("#btn-buscar");
const totalElement = document.querySelector("#historico-total");
const periodoElement = document.querySelector("#historico-periodo");
const quantidadeElement = document.querySelector("#historico-quantidade");
const statusElement = document.querySelector("#historico-status");
const lancamentosList = document.querySelector("#lancamentos-list");

function formatarMO(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero.toFixed(2) : "0.00";
}

function definirStatus(mensagem = "", tipo = "") {
  statusElement.textContent = mensagem;
  statusElement.className = `status history-status${tipo ? ` ${tipo}` : ""}`;
}

function definirCarregando(carregando) {
  buscarButton.disabled = carregando;
  buscarButton.textContent = carregando ? "CARREGANDO..." : "BUSCAR";
}

function getPeriodoAtual() {
  const hoje = new Date();
  let mes = hoje.getMonth() + 1;
  let ano = hoje.getFullYear();

  if (hoje.getDate() >= 26) {
    mes += 1;
    if (mes === 13) {
      mes = 1;
      ano += 1;
    }
  }

  return { mes, ano };
}

function preencherAnos(anoSelecionado) {
  const hoje = new Date();
  const anoMaximo = Math.max(hoje.getFullYear() + 1, anoSelecionado);
  const anoMinimo = Math.min(2020, anoSelecionado);

  anoSelect.replaceChildren();

  for (let ano = anoMaximo; ano >= anoMinimo; ano -= 1) {
    const option = document.createElement("option");
    option.value = String(ano);
    option.textContent = String(ano);
    anoSelect.appendChild(option);
  }
}

function renderizarLancamentos(lancamentos) {
  lancamentosList.replaceChildren();

  if (!Array.isArray(lancamentos) || !lancamentos.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Nenhum lançamento encontrado neste período.";
    lancamentosList.appendChild(empty);
    return;
  }

  lancamentos.forEach((lancamento) => {
    const item = document.createElement("article");
    item.className = "record-item";

    const campos = [
      ["Data", lancamento.data || "—"],
      ["Hora", lancamento.hora || "—"],
      ["Ordem", lancamento.os || lancamento.ordemServico || "—"],
      ["M.O", formatarMO(lancamento.mo ?? lancamento.maoObra)],
    ];

    campos.forEach(([label, value], index) => {
      const cell = document.createElement("div");
      cell.className = `record-cell${index === 3 ? " record-mo" : ""}`;

      const cellLabel = document.createElement("span");
      cellLabel.className = "record-label";
      cellLabel.textContent = label;

      const cellValue = document.createElement("strong");
      cellValue.textContent = value;

      cell.append(cellLabel, cellValue);
      item.appendChild(cell);
    });

    lancamentosList.appendChild(item);
  });
}

function validarRespostaHistorico(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Resposta inválida do Apps Script.");
  }

  const sucesso = data.sucesso ?? data.ok;
  if (!sucesso) {
    throw new Error(data.erro || data.message || "Não foi possível carregar o histórico.");
  }

  if (!data.periodo || !Array.isArray(data.lancamentos)) {
    throw new Error(
      "O Apps Script publicado ainda está retornando o resumo antigo. Atualize a implantação do Web App para a versão com suporte a action=historico."
    );
  }

  return data;
}

function renderizarHistorico(data) {
  const periodo = data.periodo;
  const lancamentos = data.lancamentos;

  totalElement.textContent = formatarMO(data.total);
  periodoElement.textContent = periodo.label || `${periodo.inicio || ""} a ${periodo.fim || ""}`;

  const quantidade = Number.isFinite(Number(data.quantidade))
    ? Number(data.quantidade)
    : lancamentos.length;

  quantidadeElement.textContent = `${quantidade} ${quantidade === 1 ? "lançamento" : "lançamentos"}`;
  renderizarLancamentos(lancamentos);
}

async function lerResposta(response) {
  if (!response.ok) {
    throw new Error(`Falha na comunicação (${response.status}).`);
  }

  const texto = await response.text();

  let data;
  try {
    data = JSON.parse(texto);
  } catch (error) {
    throw new Error("O Apps Script não retornou JSON válido. Verifique a implantação e a permissão 'Qualquer pessoa'.");
  }

  return validarRespostaHistorico(data);
}

async function carregarHistorico() {
  const mes = Number(mesSelect.value);
  const ano = Number(anoSelect.value);

  if (!navigator.onLine) {
    definirStatus("Sem internet. O histórico precisa de conexão para consultar a planilha.", "error");
    renderizarLancamentos([]);
    return;
  }

  definirCarregando(true);
  definirStatus("Consultando a planilha...");

  try {
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.set("action", "historico");
    url.searchParams.set("mes", String(mes));
    url.searchParams.set("ano", String(ano));
    url.searchParams.set("_", String(Date.now()));

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    });

    const data = await lerResposta(response);
    renderizarHistorico(data);
    definirStatus();

    const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
    history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
  } catch (error) {
    console.error(error);
    totalElement.textContent = "—";
    periodoElement.textContent = "Falha ao carregar o histórico";
    quantidadeElement.textContent = "—";
    lancamentosList.replaceChildren();

    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Não foi possível consultar os lançamentos.";
    lancamentosList.appendChild(empty);

    definirStatus(error.message || "Erro ao carregar o histórico.", "error");
  } finally {
    definirCarregando(false);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  carregarHistorico();
});

window.addEventListener("online", () => {
  definirStatus("Conexão restabelecida.", "success");
  carregarHistorico();
});

window.addEventListener("offline", () => {
  definirStatus("Sem internet. A página continua disponível, mas os dados exigem conexão.", "error");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("Falha ao registrar o service worker:", error);
    });
  });
}

const query = new URLSearchParams(location.search);
const atual = getPeriodoAtual();
const mesInicial = Number(query.get("mes")) || atual.mes;
const anoInicial = Number(query.get("ano")) || atual.ano;

preencherAnos(anoInicial);
mesSelect.value = String(Math.min(12, Math.max(1, mesInicial)));
anoSelect.value = String(anoInicial);

carregarHistorico();
