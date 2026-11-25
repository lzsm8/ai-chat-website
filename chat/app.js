/* ================= AI 对话前端 =================
   技术栈：原生 JS + Axios（流式）+ Marked + DOMPurify + highlight.js
*/

const API_BASE = ''; // 与后端同源部署，留空；跨域时改为 http://127.0.0.1:5000

const SEND_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9l20-7z"/></svg>';
const STOP_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

/* ---------------- 角色性格 ---------------- */
const PERSONALITIES = [
  {
    id: 'gentle', name: '温柔', emoji: '🎀', tagline: '轻声细语 · 温暖治愈',
    system: '你现在扮演一个「温柔」性格的AI助手：说话轻声细语、善解人意，用词温暖柔和，经常给予鼓励和安慰。始终以这种温柔自然的语气回复，不要刻意堆砌。',
  },
  {
    id: 'tsundere', name: '傲娇', emoji: '😤', tagline: '嘴硬心软 · 爱说反话',
    system: '你现在扮演一个「傲娇」性格的角色：嘴硬心软、爱说反话，明明关心别人却不肯承认，习惯用「哼」「才、才不是呢」「随便你」等别扭表达，偶尔露出害羞的一面。保持自然，不要每句话都傲娇过头。',
  },
  {
    id: 'scheming', name: '腹黑', emoji: '😏', tagline: '优雅腹黑 · 暗藏玄机',
    system: '你现在扮演一个「腹黑」性格的角色：表面温和有礼、笑容可掬，实则心思缜密，喜欢意味深长的暗示、偶尔捉弄人，说话优雅但暗藏玄机，偶尔「呵呵」一笑。保持自然。',
  },
  {
    id: 'genki', name: '元气', emoji: '✨', tagline: '活力满满 · 热情开朗',
    system: '你现在扮演一个「元气」性格的AI助手：活泼开朗、充满能量，说话常带感叹号和可爱的语气词（如「呀」「哦」「啦」），热情地鼓励和支持对方。保持自然。',
  },
  {
    id: 'sarcastic', name: '毒舌', emoji: '🗡️', tagline: '犀利吐槽 · 一针见血',
    system: '你现在扮演一个「毒舌」性格的角色：吐槽犀利、一针见血，说话直接不留情面，但本质并无恶意，吐槽中带着关心。保持自然，不要太刻薄。',
  },
  {
    id: 'chuuni', name: '中二', emoji: '🔮', tagline: '华丽神秘 · 中二满满',
    system: '你现在扮演一个「中二病」性格的角色：说话夸张华丽，爱用神秘的中二词汇，自称掌握某种特殊力量、是「被选中的存在」，常给招式起炫酷名字。保持自然有趣。',
  },
];

/* ---------------- 状态 ---------------- */
let conversations = []; // [{ id, title, messages: [{role, content}], createdAt }]
let currentId = null;
let isGenerating = false;
let abortController = null;
let currentPersonality = localStorage.getItem('ai_chat_personality') || 'gentle';

/* ---------------- DOM ---------------- */
const $ = (s) => document.querySelector(s);
const chatScroll = $('#chatScroll');
const messagesEl = $('#messages');
const welcomeEl = $('#welcome');
const inputEl = $('#input');
const sendBtn = $('#sendBtn');
const historyList = $('#historyList');
const newChatBtn = $('#newChatBtn');
const clearBtn = $('#clearBtn');
const conversationTitle = $('#conversationTitle');
const sidebar = $('#sidebar');

/* ---------------- 工具 ---------------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const loadStorage = () => {
  try { return JSON.parse(localStorage.getItem('ai_chat_conversations') || '[]'); }
  catch { return []; }
};
const saveStorage = () => localStorage.setItem('ai_chat_conversations', JSON.stringify(conversations));

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- Markdown ---------------- */
marked.setOptions({ gfm: true, breaks: true });
const renderMarkdown = (text) => DOMPurify.sanitize(marked.parse(text || ''));
function highlight(root) {
  root.querySelectorAll('pre code').forEach((b) => { try { hljs.highlightElement(b); } catch {} });
}

/* ---------------- 消息渲染 ---------------- */
function createMessage(role) {
  const wrapper = document.createElement('div');
  wrapper.className = `msg ${role}`;
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'assistant' ? getPersonality().emoji : '我';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  wrapper.append(avatar, bubble);
  return { wrapper, bubble };
}

function appendMessage(role, content) {
  welcomeEl.style.display = 'none';
  const { wrapper, bubble } = createMessage(role);
  if (role === 'assistant') { bubble.innerHTML = renderMarkdown(content); highlight(bubble); }
  else bubble.textContent = content;
  messagesEl.appendChild(wrapper);
  scrollToBottom();
  return { wrapper, bubble };
}

function startAssistantStream() {
  welcomeEl.style.display = 'none';
  const { wrapper, bubble } = createMessage('assistant');
  bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  messagesEl.appendChild(wrapper);
  let raw = '', raf = null, started = false;

  const render = () => { bubble.innerHTML = renderMarkdown(raw); highlight(bubble); scrollToBottom(); };

  return {
    append(text) {
      if (!started) { started = true; raw = ''; }
      raw += text;
      if (!raf) raf = requestAnimationFrame(() => { raf = null; render(); });
    },
    finalize() {
      if (!started) bubble.innerHTML = renderMarkdown('*(无回复)*');
      else { if (raf) { cancelAnimationFrame(raf); raf = null; } render(); }
    },
    setError(msg) { bubble.innerHTML = `<div class="error">⚠️ ${escapeHtml(msg)}</div>`; scrollToBottom(); },
    get text() { return raw; },
  };
}

/* ---------------- 滚动 / 输入 ---------------- */
function scrollToBottom() {
  requestAnimationFrame(() => { chatScroll.scrollTop = chatScroll.scrollHeight; });
}
function autoResize() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px';
}

/* ---------------- 流式请求（Axios + onDownloadProgress） ---------------- */
async function streamChat(messages, { onDelta, onError, signal }) {
  let consumed = 0;
  let lineBuf = '';

  const processLine = (line) => {
    if (!line || line === '[DONE]') return;
    try {
      const obj = JSON.parse(line);
      if (obj.delta) onDelta(obj.delta);
      if (obj.error) onError(obj.error);
    } catch {}
  };
  const feed = (text) => {
    text = text || '';
    const part = text.slice(consumed);
    consumed = text.length;
    lineBuf += part;
    let nl;
    while ((nl = lineBuf.indexOf('\n')) !== -1) {
      processLine(lineBuf.slice(0, nl).trim());
      lineBuf = lineBuf.slice(nl + 1);
    }
  };

  const response = await axios.post(
    `${API_BASE}/api/chat`,
    { messages, temperature: 0.7 },
    {
      responseType: 'text',
      signal,
      onDownloadProgress: (e) => {
        const xhr = e.target || e.currentTarget;
        if (xhr && xhr.responseText != null) feed(xhr.responseText);
      },
    },
  );

  feed(response.data);
  processLine(lineBuf.trim());
}

/* ---------------- 发送消息 ---------------- */
async function handleSend(text) {
  text = (text || '').trim();
  if (!text || isGenerating) return;

  welcomeEl.style.display = 'none';

  if (!currentId) {
    const conv = { id: uid(), title: '', messages: [], createdAt: Date.now() };
    conversations.push(conv);
    currentId = conv.id;
  }
  const conv = conversations.find((c) => c.id === currentId);
  if (!conv) return;

  conv.messages.push({ role: 'user', content: text });
  if (!conv.title) conv.title = text.slice(0, 20);
  saveStorage();
  renderHistory();
  conversationTitle.textContent = conv.title;
  appendMessage('user', text);

  inputEl.value = '';
  autoResize();

  isGenerating = true;
  setGenerating(true);
  const stream = startAssistantStream();
  abortController = new AbortController();
  let errored = null;

  try {
    const apiMessages = [
      { role: 'system', content: getPersonality().system },
      ...conv.messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    await streamChat(
      apiMessages,
      {
        signal: abortController.signal,
        onDelta: (d) => stream.append(d),
        onError: (m) => { errored = m; stream.setError(m); },
      },
    );
    if (!errored) {
      conv.messages.push({ role: 'assistant', content: stream.text || '(空回复)' });
      stream.finalize();
    }
  } catch (err) {
    if (axios.isCancel(err)) {
      if (stream.text) {
        conv.messages.push({ role: 'assistant', content: stream.text + '\n\n*(已停止)*' });
        stream.finalize();
      } else {
        stream.setError('已停止生成');
      }
    } else {
      const detail = err && err.response && err.response.data && err.response.data.error;
      stream.setError(detail || (err && err.message) || '网络错误，请稍后重试');
    }
  } finally {
    isGenerating = false;
    setGenerating(false);
    abortController = null;
    saveStorage();
    scrollToBottom();
  }
}

function setGenerating(on) {
  sendBtn.classList.toggle('stop', on);
  sendBtn.innerHTML = on ? STOP_ICON : SEND_ICON;
  sendBtn.title = on ? '停止生成' : '发送';
}

/* ---------------- 会话 / 历史 ---------------- */
function showWelcome() {
  currentId = null;
  welcomeEl.style.display = 'flex';
  messagesEl.innerHTML = '';
  conversationTitle.textContent = '新对话';
}
function loadConversation(id) {
  const conv = conversations.find((c) => c.id === id);
  if (!conv) return;
  currentId = id;
  conversationTitle.textContent = conv.title || '新对话';
  messagesEl.innerHTML = '';
  if (conv.messages.length) {
    welcomeEl.style.display = 'none';
    conv.messages.forEach((m) => appendMessage(m.role, m.content));
  } else showWelcome();
  renderHistory();
  closeSidebar();
}
function deleteConversation(id) {
  conversations = conversations.filter((c) => c.id !== id);
  saveStorage();
  if (currentId === id) { currentId = null; showWelcome(); }
  renderHistory();
}
function renderHistory() {
  historyList.innerHTML = '';
  if (!conversations.length) {
    historyList.innerHTML = '<div class="history-empty">暂无历史对话</div>';
    return;
  }
  [...conversations].reverse().forEach((conv) => {
    const item = document.createElement('div');
    item.className = 'history-item' + (conv.id === currentId ? ' active' : '');
    const title = document.createElement('span');
    title.className = 'history-title';
    title.textContent = conv.title || '新对话';
    const del = document.createElement('button');
    del.className = 'history-del';
    del.textContent = '×';
    del.title = '删除对话';
    item.append(title, del);
    item.addEventListener('click', () => loadConversation(conv.id));
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteConversation(conv.id); });
    historyList.appendChild(item);
  });
}

/* ---------------- 角色性格 UI ---------------- */
function getPersonality() {
  return PERSONALITIES.find((p) => p.id === currentPersonality) || PERSONALITIES[0];
}

function renderPersonalityGrid() {
  const grid = $('#personalityGrid');
  if (!grid) return;
  grid.innerHTML = '';
  PERSONALITIES.forEach((p) => {
    const card = document.createElement('button');
    card.className = 'personality-card' + (p.id === currentPersonality ? ' active' : '');
    const emoji = document.createElement('span');
    emoji.className = 'p-emoji';
    emoji.textContent = p.emoji;
    const name = document.createElement('span');
    name.className = 'p-name';
    name.textContent = p.name;
    card.append(emoji, name);
    card.addEventListener('click', () => selectPersonality(p.id));
    grid.appendChild(card);
  });
}

function renderPersonalityMenu() {
  const menu = $('#personalityMenu');
  if (!menu) return;
  menu.innerHTML = '';
  PERSONALITIES.forEach((p) => {
    const opt = document.createElement('button');
    opt.className = 'personality-option' + (p.id === currentPersonality ? ' active' : '');
    const emoji = document.createElement('span');
    emoji.className = 'p-emoji';
    emoji.textContent = p.emoji;
    const name = document.createElement('span');
    name.className = 'p-name';
    name.textContent = p.name;
    const tag = document.createElement('span');
    tag.className = 'p-tagline';
    tag.textContent = p.tagline;
    opt.append(emoji, name, tag);
    if (p.id === currentPersonality) {
      const check = document.createElement('span');
      check.className = 'p-check';
      check.textContent = '✓';
      opt.appendChild(check);
    }
    opt.addEventListener('click', () => { selectPersonality(p.id); closePersonalityMenu(); });
    menu.appendChild(opt);
  });
}

function updatePersonalityUI() {
  const p = getPersonality();
  $('#pCurrentEmoji').textContent = p.emoji;
  $('#pCurrentName').textContent = p.name;
  $('#welcomeLogo').textContent = p.emoji;
  renderPersonalityGrid();
  renderPersonalityMenu();
}

function selectPersonality(id) {
  if (!PERSONALITIES.some((p) => p.id === id)) return;
  currentPersonality = id;
  localStorage.setItem('ai_chat_personality', id);
  updatePersonalityUI();
}

function togglePersonalityMenu() {
  $('.personality-picker').classList.toggle('open');
}
function closePersonalityMenu() {
  $('.personality-picker').classList.remove('open');
}

/* ---------------- 侧边栏 ---------------- */
function closeSidebar() { sidebar.classList.remove('open'); }

/* ---------------- 事件绑定 ---------------- */
sendBtn.addEventListener('click', () => {
  if (isGenerating) abortController && abortController.abort();
  else handleSend(inputEl.value);
});
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(inputEl.value); }
});
inputEl.addEventListener('input', autoResize);
newChatBtn.addEventListener('click', () => {
  currentId = null; showWelcome(); renderHistory(); closeSidebar(); inputEl.focus();
});
clearBtn.addEventListener('click', () => {
  if (currentId) deleteConversation(currentId); else showWelcome();
});
document.querySelectorAll('.suggestion').forEach((btn) =>
  btn.addEventListener('click', () => handleSend(btn.textContent.trim())));
$('#sidebarToggle').addEventListener('click', () => {
  if (window.innerWidth <= 900) sidebar.classList.toggle('open');
  else sidebar.classList.toggle('collapsed');
});
$('#mobileMenuBtn').addEventListener('click', () => sidebar.classList.toggle('open'));
$('#personalityBtn').addEventListener('click', (e) => { e.stopPropagation(); togglePersonalityMenu(); });
document.addEventListener('click', (e) => { if (!e.target.closest('.personality-picker')) closePersonalityMenu(); });

/* ---------------- 初始化 ---------------- */
conversations = loadStorage();
updatePersonalityUI();
renderHistory();
showWelcome(); // 启动时固定进入「选择性格」欢迎页，历史对话从侧边栏点开
