const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby1VuJcd7ZEsJLWh2dA15rACCFVwgbPZjyK-8VQ4oM86lhOS_n9Lr1Bhrch6ZsNXPY0/exec";
const CACHE_RESUMO_KEY = "maodeobra:resumo:v1";
const CACHE_RESUMO_TTL = 2 * 60 * 1000;

const form = document.querySelector("#registro-form");
const ordemServicoInput = document.querySelector("#ordem-servico");
const maoObraInput = document.querySelector("#mao-obra");
const orcamentoCheckbox = document.querySelector("#orcamento");
const totalElement = document.querySelector("#total-mo");
const periodoElement = document.querySelector("#periodo-atual");
const historyList = document.querySelector("#history-list");
const statusElement = document.querySelector("#status");
const submitButton = document.querySelector("#btn-registrar");

function lerCacheLocal(chave) {
  try {
    const bruto = localStorage.getItem(chave);
    if (!bruto) return null;

    const cache = JSON.parse(bruto);
    if (!cache || typeof cache !== "object" || !cache.data) return null;

    return cache;
  } catch (error) {
    console.warn("Não foi possível ler o cache local:", error);
    return null;
  }
}

function salvarCacheLocal(chave, data) {
  try {
    localStorage.setItem(chave, JSON.stringify({
      salvoEm: Date.now(),
      data,
    }));
  } catch (error) {
    console.warn("Não foi possível salvar o cache local:", error);
  }
}

function cacheAindaValido(cache, ttl) {
  const salvoEm = Number(cache?.salvoEm);
  return Number.isFinite(salvoEm) && Date.now() - salvoEm < ttl;
}

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

function normalizarResumo(data) {
  const periodoLegado = data.period || {};
  const ciclosOriginais = Array.isArray(data.ciclos)
    ? data.ciclos
    : Array.isArray(data.history)
      ? data.history
      : [];

  const cicloAtual = data.cicloAtual || periodoLegado.label || "";

  const ciclos = ciclosOriginais.map((cycle) => ({
    ciclo: cycle.ciclo || cycle.label || "Ciclo",
    total: cycle.total,
    dataHora: cycle.ultimoLancamento || cycle.dataHora || "",
    current: cycle.current === true || (cycle.ciclo || cycle.label) === cicloAtual,
  }));

  return {
    totalAtual: data.totalAtual ?? data.total ?? "0.00",
    cicloAtual,
    ciclos,
  };
}

function renderizarResumo(data) {
  const resumo = normalizarResumo(data);
  totalElement.textContent = formatarMO(resumo.totalAtual);
  periodoElement.textContent = resumo.cicloAtual;
  renderizarHistorico(resumo.ciclos, resumo.cicloAtual);
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
    const atual = cycle.current === true || cycle.ciclo === cicloAtual;
    const item = document.createElement("article");
    item.className = `history-item${atual ? " current" : ""}`;

    const info = document.createElement("div");
    info.className = "history-info";

    const period = document.createElement("strong");
    period.textContent = cycle.dataHora || cycle.ciclo || "Ciclo";
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

  let data;

  try {
    data = await response.json();
  } catch (error) {
    throw new Error("O Apps Script não retornou JSON. Verifique a implantação e o acesso como 'Qualquer pessoa'.");
  }

  const sucesso = data.sucesso ?? data.ok;

  if (!sucesso) {
    throw new Error(data.erro || data.message || "Não foi possível concluir a operação.");
  }

  return data;
}

async function carregarTotal({ silencioso = false, forcar = false } = {}) {
  const cache = lerCacheLocal(CACHE_RESUMO_KEY);

  if (cache?.data) {
    renderizarResumo(cache.data);
  }

  if (!forcar && cacheAindaValido(cache, CACHE_RESUMO_TTL)) {
    return cache.data;
  }

  if (!navigator.onLine) {
    if (!silencioso) {
      definirStatus(
        cache?.data
          ? "Sem internet. Exibindo os últimos dados salvos neste aparelho."
          : "Sem internet. Ainda não há dados salvos neste aparelho.",
        cache?.data ? "" : "error"
      );
    }
    return cache?.data || null;
  }

  try {
    const response = await fetch(`${APPS_SCRIPT_URL}?action=resumo&_=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    });

    const data = await lerResposta(response);
    salvarCacheLocal(CACHE_RESUMO_KEY, data);
    renderizarResumo(data);
    return data;
  } catch (error) {
    console.error(error);

    if (cache?.data) {
      if (!silencioso) {
        definirStatus("Não foi possível atualizar agora. Exibindo os últimos dados salvos.");
      }
      return cache.data;
    }

    if (!silencioso) {
      definirStatus(error.message || "Não foi possível carregar os dados da planilha.", "error");
    }
    throw error;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  definirStatus();

  if (!navigator.onLine) {
    definirStatus("Sem internet. Conecte-se para registrar na planilha.", "error");
    return;
  }

  const ordemServico = ordemServicoInput.value.trim();
  const maoObra = converterMO(maoObraInput.value);
  const orcamento = orcamentoCheckbox.checked ? 1 : 0;

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
        orcamento,
      }),
    });

    await lerResposta(response);

    form.reset();
    ordemServicoInput.focus();
    definirStatus("Registro salvo com sucesso.", "success");

    await carregarTotal({ silencioso: true, forcar: true });
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

window.addEventListener("online", () => {
  definirStatus("Conexão restabelecida.", "success");
  carregarTotal({ silencioso: true }).catch(() => {});
});

window.addEventListener("offline", () => {
  const cache = lerCacheLocal(CACHE_RESUMO_KEY);
  definirStatus(
    cache?.data
      ? "Sem internet. Os últimos dados salvos continuam disponíveis."
      : "Sem internet. O registro está temporariamente indisponível.",
    cache?.data ? "" : "error"
  );
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("Falha ao registrar o service worker:", error);
    });
  });
}

const cacheResumoInicial = lerCacheLocal(CACHE_RESUMO_KEY);
if (cacheResumoInicial?.data) {
  renderizarResumo(cacheResumoInicial.data);
}

carregarTotal({ silencioso: Boolean(cacheResumoInicial?.data) }).catch(() => {});
