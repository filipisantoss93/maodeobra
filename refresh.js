/* Atualização compartilhada: botão e gesto de puxar ao chegar ao topo. */
window.configurarAtualizacaoPagina = function configurarAtualizacaoPagina({ botao, atualizar }) {
  if (!botao || typeof atualizar !== "function") return;

  const indicador = document.createElement("div");
  indicador.className = "pull-refresh-indicator";
  indicador.setAttribute("aria-hidden", "true");
  document.body.appendChild(indicador);

  const LIMIAR = 85;
  let inicioX = 0;
  let inicioY = 0;
  let acompanhando = false;
  let deslocamento = 0;
  let atualizando = false;

  function esconderIndicador() {
    indicador.classList.remove("visible");
    deslocamento = 0;
  }

  async function executar(viaGesto = false) {
    if (atualizando || botao.disabled) return;
    atualizando = true;
    botao.disabled = true;
    botao.classList.add("is-refreshing");
    botao.setAttribute("aria-label", "Atualizando dados");
    botao.setAttribute("aria-busy", "true");

    if (viaGesto) {
      indicador.textContent = "Atualizando...";
      indicador.classList.add("visible");
    }

    try {
      await atualizar();
    } catch (error) {
      console.error("Falha na atualização:", error);
    } finally {
      atualizando = false;
      botao.disabled = false;
      botao.classList.remove("is-refreshing");
      botao.setAttribute("aria-label", "Atualizar dados");
      botao.removeAttribute("aria-busy");
      esconderIndicador();
    }
  }

  botao.addEventListener("click", () => executar());

  document.addEventListener("touchstart", (event) => {
    acompanhando = false;
    if (
      atualizando ||
      botao.disabled ||
      event.touches.length !== 1 ||
      window.scrollY > 0 ||
      event.target.closest("input, select, textarea, button, a, label, [contenteditable]")
    ) return;

    inicioX = event.touches[0].clientX;
    inicioY = event.touches[0].clientY;
    deslocamento = 0;
    acompanhando = true;
  }, { passive: true });

  document.addEventListener("touchmove", (event) => {
    if (!acompanhando || event.touches.length !== 1) return;

    const deltaX = event.touches[0].clientX - inicioX;
    const deltaY = event.touches[0].clientY - inicioY;

    if (window.scrollY > 0 || Math.abs(deltaX) > Math.max(15, deltaY)) {
      acompanhando = false;
      esconderIndicador();
      return;
    }

    if (deltaY <= 8) return;

    event.preventDefault();
    deslocamento = deltaY;
    indicador.textContent = deltaY >= LIMIAR ? "Solte para atualizar" : "Puxe para atualizar";
    indicador.classList.add("visible");
  }, { passive: false });

  document.addEventListener("touchend", () => {
    if (!acompanhando) return;
    acompanhando = false;

    if (deslocamento >= LIMIAR) {
      executar(true);
    } else {
      esconderIndicador();
    }
  }, { passive: true });

  document.addEventListener("touchcancel", () => {
    acompanhando = false;
    if (!atualizando) esconderIndicador();
  }, { passive: true });
};
