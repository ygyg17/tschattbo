(function () {
  'use strict';

  if (document.getElementById('seminyakAssistant')) return;

  const config = window.SUPABASE_CONFIG || {};
  const MAX_MESSAGE_LENGTH = 800;
  const MAX_CONTEXT_MESSAGES = 8;
  const messages = [];

  const widget = document.createElement('section');
  widget.id = 'seminyakAssistant';
  widget.className = 'ai-assistant';
  widget.setAttribute('aria-label', 'The Seminyak Assistant');
  widget.innerHTML = `
    <button class="ai-launcher" type="button" aria-label="Open The Seminyak Assistant" aria-expanded="false">
      <svg class="ai-launcher-chat" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>
      <svg class="ai-launcher-close" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
      <span>The Seminyak Assistant</span>
    </button>
    <div class="ai-panel" role="dialog" aria-modal="false" aria-labelledby="aiAssistantTitle" hidden>
      <header class="ai-header">
        <div class="ai-avatar" aria-hidden="true">S</div>
        <div class="ai-heading">
          <strong id="aiAssistantTitle">The Seminyak Assistant</strong>
          <span><i></i> Online</span>
        </div>
        <button class="ai-close" type="button" aria-label="Close chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </header>
      <div class="ai-messages" aria-live="polite" aria-label="Chat messages"></div>
      <div class="ai-suggestions" aria-label="Suggested questions">
        <button type="button">What room types are available?</button>
        <button type="button">What dining options do you have?</button>
        <button type="button">How can I contact the resort?</button>
      </div>
      <form class="ai-form">
        <textarea class="ai-input" rows="1" maxlength="${MAX_MESSAGE_LENGTH}" placeholder="Ask about The Seminyak..." aria-label="Your message" required></textarea>
        <button class="ai-send" type="submit" aria-label="Send message" disabled>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
        </button>
      </form>
      <p class="ai-privacy">Chat is not saved. Information may change; verify important details with the resort.</p>
    </div>`;

  document.body.appendChild(widget);

  const launcher = widget.querySelector('.ai-launcher');
  const panel = widget.querySelector('.ai-panel');
  const closeButton = widget.querySelector('.ai-close');
  const messageList = widget.querySelector('.ai-messages');
  const suggestions = widget.querySelector('.ai-suggestions');
  const form = widget.querySelector('.ai-form');
  const input = widget.querySelector('.ai-input');
  const sendButton = widget.querySelector('.ai-send');
  let busy = false;

  function appendInlineContent(container, text) {
    const tokenPattern = /(\*\*[^*\n]+\*\*|https?:\/\/[^\s<>]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/g;
    let cursor = 0;

    text.replace(tokenPattern, (token, _match, offset) => {
      if (offset > cursor) container.appendChild(document.createTextNode(text.slice(cursor, offset)));

      if (token.startsWith('**') && token.endsWith('**')) {
        const boldText = token.slice(2, -2);
        if (/^(https?:\/\/[^\s<>]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})$/.test(boldText.trim())) {
          appendInlineContent(container, boldText);
        } else {
          const strong = document.createElement('strong');
          appendInlineContent(strong, boldText);
          container.appendChild(strong);
        }
      } else {
        const trailing = token.match(/[.,!?;:)]+$/)?.[0] || '';
        const value = trailing ? token.slice(0, -trailing.length) : token;
        const link = document.createElement('a');
        link.href = value.includes('@') && !value.startsWith('http') ? `mailto:${value}` : value;
        link.textContent = value;
        link.target = value.startsWith('http') ? '_blank' : '';
        if (link.target) link.rel = 'noopener noreferrer';
        container.appendChild(link);
        if (trailing) container.appendChild(document.createTextNode(trailing));
      }

      cursor = offset + token.length;
      return token;
    });

    if (cursor < text.length) container.appendChild(document.createTextNode(text.slice(cursor)));
  }

  function renderAssistantContent(container, text) {
    const lines = text.split(/\r?\n/);
    let list = null;

    lines.forEach((line) => {
      const bullet = line.match(/^\s*[-*]\s+(.+)$/);
      if (bullet) {
        if (!list) {
          list = document.createElement('ul');
          container.appendChild(list);
        }
        const item = document.createElement('li');
        appendInlineContent(item, bullet[1]);
        list.appendChild(item);
        return;
      }

      list = null;
      if (!line.trim()) {
        container.appendChild(document.createElement('br'));
        return;
      }

      const paragraph = document.createElement('p');
      appendInlineContent(paragraph, line.replace(/^#{1,4}\s+/, ''));
      container.appendChild(paragraph);
    });
  }

  function addMessage(role, text, pending) {
    const row = document.createElement('div');
    row.className = `ai-message-row ai-message-${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'ai-bubble';
    if (pending) {
      bubble.classList.add('ai-typing');
      bubble.setAttribute('aria-label', 'Assistant is typing');
      bubble.innerHTML = '<span></span><span></span><span></span>';
    } else {
      if (role === 'assistant') renderAssistantContent(bubble, text);
      else bubble.textContent = text;
    }
    row.appendChild(bubble);
    messageList.appendChild(row);
    messageList.scrollTop = messageList.scrollHeight;
    return row;
  }

  function setOpen(open) {
    panel.hidden = !open;
    widget.classList.toggle('is-open', open);
    document.body.classList.toggle('ai-chat-open', open);
    launcher.setAttribute('aria-expanded', String(open));
    launcher.setAttribute('aria-label', open ? 'Close The Seminyak Assistant' : 'Open The Seminyak Assistant');
    if (open) window.setTimeout(() => input.focus(), 80);
  }

  function resizeInput() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 96)}px`;
    sendButton.disabled = busy || !input.value.trim();
  }

  async function sendMessage(text) {
    const cleanText = text.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!cleanText || busy) return;

    busy = true;
    input.value = '';
    resizeInput();
    suggestions.hidden = true;
    addMessage('user', cleanText);
    messages.push({ role: 'user', content: cleanText });
    const typing = addMessage('assistant', '', true);

    try {
      if (!config.AI_CHAT_API_URL) throw new Error('Assistant endpoint is not configured.');
      const response = await fetch(config.AI_CHAT_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.ANON_KEY || ''
        },
        body: JSON.stringify({
          message: cleanText,
          messages: messages.slice(-MAX_CONTEXT_MESSAGES),
          page: window.location.pathname
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'The assistant is temporarily unavailable.');

      const answer = String(result.answer || '').trim();
      if (!answer) throw new Error('Sorry, I could not generate a reply just now. Please try again in a moment.');
      typing.remove();
      addMessage('assistant', answer);
      messages.push({ role: 'assistant', content: answer });
    } catch (error) {
      typing.remove();
      addMessage('error', error.message || 'The assistant is temporarily unavailable. Please try again.');
    } finally {
      busy = false;
      resizeInput();
      input.focus();
    }
  }

  launcher.addEventListener('click', () => setOpen(panel.hidden));
  closeButton.addEventListener('click', () => setOpen(false));
  input.addEventListener('input', resizeInput);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    sendMessage(input.value);
  });
  suggestions.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button) sendMessage(button.textContent);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) setOpen(false);
  });
  window.addEventListener('pagehide', () => document.body.classList.remove('ai-chat-open'));

  addMessage('assistant', 'Hello! I am The Seminyak Assistant. How may I help you today?');
})();
