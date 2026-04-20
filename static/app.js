/* ── State ── */
let sessionId = null;
let currentCustomerId = null;
let currentCustomerName = null;
let isLoading = false;

/* ── DOM refs ── */
const landing       = document.getElementById('landing');
const chatPage      = document.getElementById('chatPage');
const customerSelect = document.getElementById('customerSelect');
const startBtn      = document.getElementById('startBtn');
const logoBtn       = document.getElementById('logoBtn');
const chatArea      = document.getElementById('chatArea');
const messagesEl    = document.getElementById('messages');
const messageInput  = document.getElementById('messageInput');
const sendBtn       = document.getElementById('sendBtn');
const cartBtn       = document.getElementById('cartBtn');
const cartCount     = document.getElementById('cartCount');
const cartPanel     = document.getElementById('cartPanel');
const cartOverlay   = document.getElementById('cartOverlay');
const closeCartBtn  = document.getElementById('closeCartBtn');
const cartPanelBody = document.getElementById('cartPanelBody');

/* ── Image URL helper ── */
const ITEM_FOLDERS = {
  'T-shirt':      'T-shirts',
  'Polo':         'Polos',
  'Plain Shirt':  'Plain Shirt',
  'Checked Shirt':'Checked Shirt',
  'Jeans':        'Jeans',
};

function getImageUrl(item, colour) {
  const folder = ITEM_FOLDERS[item] || item;
  return `/Images/${encodeURIComponent(folder)}/${colour}.png`;
}

/* ── Boot: load customers ── */
async function init() {
  const res = await fetch('/api/customers');
  const customers = await res.json();
  customers.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.customer_id;
    opt.textContent = c.customer_name;
    customerSelect.appendChild(opt);
  });
}

/* ── Customer select enables Start button ── */
customerSelect.addEventListener('change', () => {
  startBtn.disabled = !customerSelect.value;
});

/* ── Start Shopping ── */
startBtn.addEventListener('click', async () => {
  const id = customerSelect.value;
  if (!id) return;
  await beginSession(id);
});

async function beginSession(customerId) {
  currentCustomerId = customerId;

  // Fetch greeting + session
  const res = await fetch(`/api/greet/${customerId}`);
  const data = await res.json();
  sessionId = data.session_id;
  currentCustomerName = customerSelect.options[customerSelect.selectedIndex]?.textContent || '';

  // Reset chat
  messagesEl.innerHTML = '';

  // Switch views
  landing.style.display = 'none';
  chatPage.style.display = 'flex';
  document.body.classList.add('in-chat');

  // Show greeting
  appendAgentMessage(data.message);
  enableInput();
  await refreshCartCount();
}

/* ── Logo → back to landing ── */
logoBtn.addEventListener('click', () => {
  chatPage.style.display = 'none';
  landing.style.display = 'flex';
  document.body.classList.remove('in-chat');
  sessionId = null;
  currentCustomerId = null;
  cartCount.textContent = '0';
  setLoading(false);
});

/* ── Send message ── */
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || isLoading || !sessionId) return;

  appendUserMessage(text);
  messageInput.value = '';
  autoResizeTextarea();
  setLoading(true);
  showTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        customer_id: currentCustomerId,
        message: text,
      }),
    });
    const data = await res.json();
    hideTyping();

    if (data.cart_updated && data.cart_item) {
      // Message 1: cart confirmation as its own bubble
      const { item, size, colour } = data.cart_item;
      appendAgentMessage(
        `Done! I've added the ${colour} ${item} in size ${size} to your cart. Head over whenever you're ready to check out.`
      );
      // Message 2: upsell as a separate bubble (may include product image)
      if (data.message) {
        appendAgentMessage(data.message, data.products, data.escalated);
      }
      await refreshCartCount();
    } else {
      appendAgentMessage(data.message, data.products, data.escalated);
    }
  } catch {
    hideTyping();
    appendAgentMessage('Sorry, I had trouble connecting. Please try again.');
  } finally {
    setLoading(false);
  }
}

/* ── Message renderers ── */
function appendUserMessage(text) {
  const group = document.createElement('div');
  group.className = 'message-group user';
  group.innerHTML = `<div class="user-bubble">${escapeHtml(text)}</div>`;
  messagesEl.appendChild(group);
  scrollBottom();
}

function appendAgentMessage(text, products = [], escalated = false) {
  const group = document.createElement('div');
  group.className = 'message-group assistant';

  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  let html = '';

  if (text) {
    html += `<div class="agent-message-text">${formatText(text)}</div>`;
    html += `<div class="agent-attribution">Alex · ${now}</div>`;
  }

  if (products && products.length > 0) {
    html += `<div class="product-cards">`;
    products.forEach(p => { html += renderProductCard(p); });
    html += `</div>`;
  }

  if (escalated) {
    html += `
      <div class="escalation-banner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
        </svg>
        Connecting you to a human agent — someone will be with you shortly.
      </div>`;
    disableInput();
  }

  group.innerHTML = html;

  // Bind Select this buttons
  group.querySelectorAll('.select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const item  = btn.dataset.item;
      const colour = btn.dataset.colour;
      const size  = btn.dataset.size;
      const sizeText = size ? ` in size ${size}` : '';
      messageInput.value = `I'd like the ${colour} ${item}${sizeText} please.`;
      messageInput.focus();
      autoResizeTextarea();
    });
  });

  messagesEl.appendChild(group);
  scrollBottom();
}

function renderProductCard(p) {
  const imgUrl   = p.image_url || getImageUrl(p.item, p.colour);
  const metaLine = p.recommended_size ? `${p.colour} · Size ${p.recommended_size}` : p.colour;
  const sizeAttr = p.recommended_size ? `data-size="${p.recommended_size}"` : '';

  return `
    <div class="product-card">
      <img src="${imgUrl}" alt="${p.colour} ${p.item}" loading="lazy" />
      <div class="product-card-info">
        <div class="product-card-name">${p.item}</div>
        <div class="product-card-meta">${metaLine}</div>
        <button class="select-btn" data-item="${p.item}" data-colour="${p.colour}" ${sizeAttr}>
          Select this
        </button>
      </div>
    </div>`;
}

/* ── Typing indicator ── */
let typingEl = null;

function showTyping() {
  typingEl = document.createElement('div');
  typingEl.className = 'typing-group';
  typingEl.innerHTML = `
    <div class="typing-dots">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>`;
  messagesEl.appendChild(typingEl);
  scrollBottom();
}

function hideTyping() {
  typingEl?.remove();
  typingEl = null;
}

/* ── Cart ── */
async function refreshCartCount() {
  if (!currentCustomerId) return;
  const res = await fetch(`/api/cart/${currentCustomerId}`);
  const data = await res.json();
  cartCount.textContent = data.count;
}

async function openCart() {
  if (!currentCustomerId) return;
  const res = await fetch(`/api/cart/${currentCustomerId}`);
  const data = await res.json();

  cartPanelBody.innerHTML = data.cart.length === 0
    ? '<div class="empty-cart">Your cart is empty.</div>'
    : data.cart.map(item => `
        <div class="cart-item">
          <img class="cart-item-img" src="${getImageUrl(item.item, item.colour)}" alt="${item.item}" />
          <div>
            <div class="cart-item-name">${item.colour} ${item.item}</div>
            <div class="cart-item-meta">Size ${item.size}</div>
          </div>
        </div>`).join('');

  cartPanel.classList.add('open');
  cartOverlay.classList.add('active');
}

function closeCart() {
  cartPanel.classList.remove('open');
  cartOverlay.classList.remove('active');
}

cartBtn.addEventListener('click', openCart);
closeCartBtn.addEventListener('click', closeCart);
cartOverlay.addEventListener('click', closeCart);

/* ── Input helpers ── */
function enableInput() {
  messageInput.disabled = false;
  sendBtn.disabled = false;
  messageInput.focus();
}

function disableInput() {
  messageInput.disabled = true;
  sendBtn.disabled = true;
}

function setLoading(val) {
  isLoading = val;
  sendBtn.disabled = val;
  messageInput.disabled = val;
}

sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

messageInput.addEventListener('input', autoResizeTextarea);

function autoResizeTextarea() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
}

/* ── Utilities ── */
function scrollBottom() {
  chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatText(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
}

/* ── Boot ── */
init();
