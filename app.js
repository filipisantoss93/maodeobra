const APPS_SCRIPT_URL = "";

const form = document.querySelector("#registro-form");
const ordemServicoInput = document.querySelector("#ordem-servico");
const maoObraInput = document.querySelector("#mao-obra");
const totalElement = document.querySelector("#total-mo");
const periodoElement = document.querySelector("#periodo-atual");
const historyList = document.querySelector("#history-list");
const statusElement = document.querySelector("#status");
const submitButton = document.querySelector("#btn-registrar");

function formatarMO(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero.toFixed(2) : "0.00";
}

function converterMO(valor) {
  if (typeof valor !== "string") return NaN;

  const normalizado = valor
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");

  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) {
    return NaN;
  }

  return Number(normalizado);
}

function definirStatus(mensagem = "", tipo = "") {
  statusElement.textContent = mensagem;
  statusElement.className = `status${tipo ? ` ${tipo}` : ""}`;
}

function definirCarregando(carregando) {
  submitButton.disabled = carregando;
  submitButton.textContent = carregando ? "REGISTRANDO..." : "REGISTRAR";
}

function renderizarResumo(data) {
  totalElement.textContent = formatarMO(data.total);
  periodoElement.textContent = data.period?.label || "";
  renderizarHistorico(data.history || []);
}

function renderizarHistorico(history) {
  historyList.replaceChildren();

  if (!history.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Nenhum ciclo registrado ainda.";
    historyList.appendChild(empty);
    return;
  }

  history.forEach((cycle) => {
    const item = document.createElement("article");
    item.className = `history-item${cycle.current ? " current" : ""}`;

    const info = document.createElement("div");
    info.className = "history-info";

    const period = document.createElement("strong");
    period.textContent = cycle.label;

    info.appendChild(period);

    if (cycle.current) {
      const badge = document.createElement("span");
      badge.className = "current-badge";
      badge.textContent = "ATUAL";
      info.appendChild(badge);
    }

    const total = document.createElement("strong");
    total.className = "history-total";
    total.textContent = formatarMO(cycle.total);

    item.append(info, total);
    historyList.appendChild(item);
  });
}

async function lerResposta(response) {
  if (!response.ok) {
    throw new Error(`Falha na comunicação (${response.status}).`);
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.message || "Não foi possível concluir a operação.");
  }

  return data;
}

async function carregarTotal({ silencioso = false } = {}) {
  if (!APPS_SCRIPT_URL) {
    renderizarResumo({ total: "0.00", history: [] });
    if (!silencioso) {
      definirStatus("Integração com a planilha ainda não configurada.");
    }
    return null;
  }

  try {
    const separador = APPS_SCRIPT_URL.includes("?") ? "&" : "?";
    const response = await fetch(`${APPS_SCRIPT_URL}${separador}action=total&_=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    });

    const data = await lerResposta(response);
    renderizarResumo(data);
    return data;
  } catch (error) {
    console.error(error);
    if (!silencioso) {
      definirStatus("Não foi possível carregar os dados da planilha.", "error");
    }
    throw error;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  definirStatus();

  const ordemServico = ordemServicoInput.value.trim();
  const maoObra = converterMO(maoObraInput.value);

  if (!ordemServico) {
    definirStatus("Informe a ordem de serviço.", "error");
    ordemServicoInput.focus();
    return;
  }

  if (!Number.isFinite(maoObra) || maoObra < 0) {
    definirStatus("Informe a M.O no formato 0.00.", "error");
    maoObraInput.focus();
    return;
  }

  if (!APPS_SCRIPT_URL) {
    definirStatus("Configure a URL do Google Apps Script em app.js.", "error");
    return;
  }

  definirCarregando(true);

  try {
    const body = new URLSearchParams({
      ordemServico,
      maoObra: maoObra.toFixed(2),
    });

    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body,
      redirect: "follow",
    });

    const data = await lerResposta(response);
    renderizarResumo(data);

    form.reset();
    ordemServicoInput.focus();
    definirStatus("Registro salvo com sucesso.", "success");
  } catch (error) {
    console.error(error);
    definirStatus(error.message || "Erro ao registrar. Tente novamente.", "error");
  } finally {
    definirCarregando(false);
  }
});

maoObraInput.addEventListener("blur", () => {
  const valor = converterMO(maoObraInput.value);
  if (Number.isFinite(valor)) {
    maoObraInput.value = valor.toFixed(2);
  }
});

carregarTotal();
