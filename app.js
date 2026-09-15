const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzGapYoaMUO-RPQDEBtk6JKL9IWGyXPFh8rIipSrD7TiSnfhPg0r7WbvyER3RqnNiGR/exec";

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
  totalElement.textContent = formatarMO(data.totalAtual);
  periodoElement.textContent = data.cicloAtual || "";
  renderizarHistorico(data.ciclos || [], data.cicloAtual);
}

function renderizarHistorico(ciclos, cicloAtual) {
  historyList.replaceChildren();

  if (!Array.isArray(ciclos) || !ciclos.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Nenhum ciclo registrado ainda.";
    historyList.appendChild(empty);
    return;
  }

  ciclos.forEach((cycle) => {
    const atual = cycle.ciclo === cicloAtual;
    const item = document.createElement("article");
    item.className = `history-item${atual ? " current" : ""}`;

    const info = document.createElement("div");
    info.className = "history-info";

    const period = document.createElement("strong");
    period.textContent = cycle.ciclo || "Ciclo";
    info.appendChild(period);

    if (atual) {
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

  if (!data.sucesso) {
    throw new Error(data.erro || "Não foi possível concluir a operação.");
  }

  return data;
}

async function carregarTotal({ silencioso = false } = {}) {
  try {
    const response = await fetch(`${APPS_SCRIPT_URL}?_=${Date.now()}`, {
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

  definirCarregando(true);
  definirStatus("Enviando para a planilha...");

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      redirect: "follow",
      body: JSON.stringify({
        os: ordemServico,
        mo: maoObra.toFixed(2),
      }),
    });

    await lerResposta(response);

    form.reset();
    ordemServicoInput.focus();
    definirStatus("Registro salvo com sucesso.", "success");

    await carregarTotal({ silencioso: true });
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

carregarTotal().catch(() => {});
