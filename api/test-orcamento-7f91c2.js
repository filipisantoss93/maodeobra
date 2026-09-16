module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, erro: 'Método não permitido.' });
  }

  const token = String(req.query.token || '');
  const expiraEm = Date.parse('2026-09-16T22:00:00Z');

  if (Date.now() > expiraEm || token !== 'j7r4DoziY4y-PxxONTuix8mEK2rWit1U') {
    return res.status(403).json({ ok: false, erro: 'Teste indisponível.' });
  }

  const appsScriptUrl = 'https://script.google.com/macros/s/AKfycby1VuJcd7ZEsJLWh2dA15rACCFVwgbPZjyK-8VQ4oM86lhOS_n9Lr1Bhrch6ZsNXPY0/exec';
  const payload = {
    os: 'TESTE-ORCAMENTO-1609',
    mo: '0.00',
    orcamento: 1,
  };

  try {
    const resposta = await fetch(appsScriptUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    const texto = await resposta.text();
    let data = null;

    try {
      data = JSON.parse(texto);
    } catch (_) {}

    return res.status(resposta.ok ? 200 : 502).json({
      ok: resposta.ok,
      enviado: payload,
      appsScript: data || texto,
    });
  } catch (erro) {
    return res.status(500).json({ ok: false, erro: erro.message });
  }
};
