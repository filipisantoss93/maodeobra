const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby1VuJcd7ZEsJLWh2dA15rACCFVwgbPZjyK-8VQ4oM86lhOS_n9Lr1Bhrch6ZsNXPY0/exec";
const CACHE_HISTORICO_PREFIX = "maodeobra:historico:v1:";
const CACHE_HISTORICO_TTL_ATUAL = 2 * 60 * 1000;
const CACHE_HISTORICO_TTL_FECHADO = 60 * 60 * 1000;
const CACHE_HISTORICO_MAX_ITENS = 18;

const form = document.querySelector("#historico-form");
const mesSelect = document.querySelector("#mes");
const anoSelect = document.querySelector("#ano");
const buscarButton = document.querySelector("#btn-buscar");
const totalElement = document.querySelector("#historico-total");
const periodoElement = document.querySelector("#historico-periodo");
const quantidadeElement = document.querySelector("#historico-quantidade");
const statusElement = document.querySelector("#historico-status");
const lancamentosList = document.querySelector("#lancamentos-list");
const atualizarButton = document.querySelector("#btn-atualizar");
let ultimaConsultaHistorico = 0;

function chaveCacheHistorico(mes, ano) {
  return `${CACHE_HISTORICO_PREFIX}${ano}-${String(mes).padStart(2, "0")}`;
}

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

function cacheAindaValido(cache, ttl) {
  const salvoEm = Number(cache?.salvoEm);
  return Number.isFinite(salvoEm) && Date.now() - salvoEm < ttl;
}

function limparCachesHistoricoAntigos() {
  try {
    const itens = [];

    for (let i = 0; i < localStorage.length; i += 1) {
      const chave = localStorage.key(i);
      if (!chave || !chave.startsWith(CACHE_HISTORICO_PREFIX)) continue;

      const cache = lerCacheLocal(chave);
      itens.push({ chave, salvoEm: Number(cache?.salvoEm) || 0 });
    }

    itens
      .sort((a, b) => b.salvoEm - a.salvoEm)
      .slice(CACHE_HISTORICO_MAX_ITENS)
      .forEach((item) => localStorage.removeItem(item.chave));
  } catch (error) {
    console.warn("Não foi possível limpar caches antigos:", error);
  }
}

function salvarCacheHistorico(mes, ano, data) {
  try {
    localStorage.setItem(chaveCacheHistorico(mes, ano), JSON.stringify({
      salvoEm: Date.now(),
      data,
    }));
    limparCachesHistoricoAntigos();
  } catch (error) {
    console.warn("Não foi possível salvar o histórico localmente:", error);
  }
}

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

function periodoEhAtual(mes, ano) {
  const atual = getPeriodoAtual();
  return atual.mes === mes && atual.ano === ano;
}

function obterTtlHistorico(mes, ano) {
  return periodoEhAtual(mes, ano)
    ? CACHE_HISTORICO_TTL_ATUAL
    : CACHE_HISTORICO_TTL_FECHADO;
}

function atualizarUrl(mes, ano) {
  const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
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

async function carregarHistorico({ forcar = false, rejeitarFalha = false } = {}) {
  const consulta = ++ultimaConsultaHistorico;
  const mes = Number(mesSelect.value);
  const ano = Number(anoSelect.value);
  const chave = chaveCacheHistorico(mes, ano);
  const cache = lerCacheLocal(chave);

  if (cache?.data) {
    renderizarHistorico(cache.data);
    atualizarUrl(mes, ano);
  }

  const ttl = obterTtlHistorico(mes, ano);
  if (!forcar && cacheAindaValido(cache, ttl)) {
    definirStatus();
    return cache.data;
  }

  if (!navigator.onLine) {
    if (cache?.data) {
      definirStatus("Sem internet. Exibindo os dados salvos deste período.");
      if (rejeitarFalha) throw new Error("Sem internet. Não foi possível atualizar o histórico.");
      return cache.data;
    }

    definirStatus("Sem internet e sem dados salvos para este período.", "error");
    renderizarLancamentos([]);
    if (rejeitarFalha) throw new Error("Sem internet. Não foi possível atualizar o histórico.");
    return null;
  }

  const bloquearTela = forcar || !cache?.data;
  definirCarregando(bloquearTela);
  definirStatus(cache?.data ? "Atualizando dados em segundo plano..." : "Consultando a planilha...");

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
    salvarCacheHistorico(mes, ano, data);
    if (consulta !== ultimaConsultaHistorico) return data;
    renderizarHistorico(data);
    atualizarUrl(mes, ano);
    definirStatus();
    return data;
  } catch (error) {
    console.error(error);
    if (consulta !== ultimaConsultaHistorico) throw error;

    if (cache?.data) {
      definirStatus("Não foi possível atualizar agora. Exibindo os dados salvos.");
      if (rejeitarFalha) throw error;
      return cache.data;
    }

    totalElement.textContent = "—";
    periodoElement.textContent = "Falha ao carregar o histórico";
    quantidadeElement.textContent = "—";
    lancamentosList.replaceChildren();

    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Não foi possível consultar os lançamentos.";
    lancamentosList.appendChild(empty);

    definirStatus(error.message || "Erro ao carregar o histórico.", "error");
    throw error;
  } finally {
    if (consulta === ultimaConsultaHistorico) definirCarregando(false);
  }
}

window.configurarAtualizacaoPagina({
  botao: atualizarButton,
  atualizar: async () => {
    definirStatus("Atualizando histórico da planilha...");
    try {
      await carregarHistorico({ forcar: true, rejeitarFalha: true });
      definirStatus("Histórico atualizado.", "success");
    } catch (error) {
      definirStatus(
        navigator.onLine
          ? (lerCacheLocal(chaveCacheHistorico(Number(mesSelect.value), Number(anoSelect.value)))?.data
            ? "Não foi possível atualizar. Exibindo os últimos dados salvos."
            : "Não foi possível carregar os dados da planilha.")
          : "Sem internet. Não foi possível atualizar o histórico.",
        "error"
      );
    }
  },
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  carregarHistorico({ forcar: true }).catch(() => {});
});

window.addEventListener("online", () => {
  definirStatus("Conexão restabelecida.", "success");
  carregarHistorico().catch(() => {});
});

window.addEventListener("offline", () => {
  const mes = Number(mesSelect.value);
  const ano = Number(anoSelect.value);
  const cache = lerCacheLocal(chaveCacheHistorico(mes, ano));

  definirStatus(
    cache?.data
      ? "Sem internet. Os dados salvos deste período continuam disponíveis."
      : "Sem internet. Este período ainda não está salvo neste aparelho.",
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

const query = new URLSearchParams(location.search);
const atual = getPeriodoAtual();
const mesInicial = Number(query.get("mes")) || atual.mes;
const anoInicial = Number(query.get("ano")) || atual.ano;

preencherAnos(anoInicial);
mesSelect.value = String(Math.min(12, Math.max(1, mesInicial)));
anoSelect.value = String(anoInicial);

carregarHistorico().catch(() => {});
