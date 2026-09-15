const APPS_SCRIPT_URL = "";

const form = document.querySelector("#registro-form");
const ordemServicoInput = document.querySelector("#ordem-servico");
const maoObraInput = document.querySelector("#mao-obra");
const totalElement = document.querySelector("#total-mo");
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
    totalElement.textContent = "0.00";
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
    totalElement.textContent = formatarMO(data.total);
    return data;
  } catch (error) {
    console.error(error);
    if (!silencioso) {
      definirStatus("Não foi possível carregar o total da planilha.", "error");
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
    totalElement.textContent = formatarMO(data.total);

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
