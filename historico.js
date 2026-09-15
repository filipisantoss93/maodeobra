const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzGapYoaMUO-RPQDEBtk6JKL9IWGyXPFh8rIipSrD7TiSnfhPg0r7WbvyER3RqnNiGR/exec";

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

function renderizarHistorico(data) {
  const periodo = data.periodo || {};
  const lancamentos = Array.isArray(data.lancamentos) ? data.lancamentos : [];

  totalElement.textContent = formatarMO(data.total);
  periodoElement.textContent = periodo.label || "Período selecionado";

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

  const data = await response.json();
  const sucesso = data.sucesso ?? data.ok;

  if (!sucesso) {
    throw new Error(data.erro || data.message || "Não foi possível carregar o histórico.");
  }

  return data;
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
    totalElement.textContent = "0.00";
    periodoElement.textContent = "Não foi possível carregar o período";
    quantidadeElement.textContent = "0 lançamentos";
    renderizarLancamentos([]);
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
