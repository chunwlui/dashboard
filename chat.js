(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const history = [];
  let busy = false;
  function appendMessage(role, content, error = false) {
    const message = document.createElement('div');
    message.className = `message ${role}${error ? ' error' : ''}`;
    message.textContent = content;
    $('chatMessages').append(message);
    $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
    return message;
  }
  function setBusy(value) {
    busy = value;
    $('chatInput').disabled = value;
    $('chatSend').disabled = value;
    $('clearChat').disabled = value;
    document.querySelectorAll('[data-question]').forEach(button => { button.disabled = value; });
    $('chatForm').setAttribute('aria-busy', String(value));
  }
  async function send(question) {
    if (busy || !question.trim()) return;
    question = question.trim().slice(0, 4000);
    const farmData = window.AgroSense.getFarmData();
    const conversation = history.slice(-12).map(message => ({ ...message }));
    appendMessage('user', question);
    $('chatInput').value = '';
    const pending = appendMessage('assistant', 'Reading your farm context…');
    setBusy(true);
    $('chatStatus').textContent = `Asking about ${farmData.zone} · mock sensors`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, conversation, farmData }), signal: controller.signal
      });
      if (!response.ok) {
        if ([404, 405, 501].includes(response.status)) throw new Error('backend-missing');
        throw new Error('service-unavailable');
      }
      const result = await response.json();
      if (typeof result.answer !== 'string' || !result.answer.trim()) throw new Error('empty-answer');
      pending.textContent = result.answer.trim();
      // The backend appends the current question, so history excludes it in the request above.
      history.push({ role: 'user', content: `[${farmData.zone}] ${question}` }, { role: 'assistant', content: result.answer.trim() });
      if (history.length > 12) history.splice(0, history.length - 12);
      $('chatStatus').textContent = `Answered for ${farmData.zone} · Verify advice with real measurements`;
    } catch (error) {
      pending.classList.add('error');
      pending.textContent = error.name === 'AbortError'
        ? 'The request timed out. Please try again in a moment.'
        : error.message === 'backend-missing'
          ? 'Live chat needs the /api/chat backend. The local Python preview only serves static files. Deploy with the existing Cloudflare Pages function and configure DEEPSEEK_API_KEY to enable replies.'
          : 'The farm assistant is unavailable right now. Please check the chat backend and try again. No generated answer is being shown.';
      $('chatStatus').textContent = 'Chat unavailable · Your question is ready to retry';
      $('chatInput').value = question;
    } finally {
      clearTimeout(timer); setBusy(false);
      $('chatInput').focus();
      $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
    }
  }
  $('chatForm').addEventListener('submit', event => { event.preventDefault(); send($('chatInput').value); });
  document.querySelectorAll('[data-question]').forEach(button => button.addEventListener('click', () => send(button.dataset.question)));
  $('clearChat').addEventListener('click', () => {
    if (busy) return;
    history.length = 0; $('chatMessages').replaceChildren();
    appendMessage('assistant', 'A fresh start. What would you like to know about the selected farm zone?');
    $('chatStatus').textContent = 'Uses your selected zone · Requires configured chat backend';
    $('chatInput').value = ''; $('chatInput').focus();
  });
})();
