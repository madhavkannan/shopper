# System Design — Shopper AI Styling Assistant

## Overview

Shopper is a conversational shopping assistant that helps customers find men's clothing. This document records the key architectural decisions and the reasoning behind them.

---

## 1. Agent Architecture — Orchestrator with Tools

### Decision
A **single orchestrator agent with tools** (not multiple sub-agents).

### Justification
| Option | Pros | Cons |
|---|---|---|
| **Orchestrator + tools** ✅ | Low latency, single context window, simple to debug, all reasoning in one place | Less parallelism if tasks are independent |
| Multi-agent (specialised sub-agents) | Better parallelism, isolated failures | Extra latency per hop, complex orchestration, overkill for 20 products |
| LLM-as-router | Clean separation of concerns | Added complexity, no benefit at this scale |

For a 20-SKU demo with focused conversational tasks, a single agent with tools is the right call. The agent calls tools in sequence as needed (profile → search → recommend → cart), and the total number of tool calls per turn is low (2–4). There is no benefit to parallelising across sub-agents here.

**At production scale** (1000s of SKUs, real-time stock, order management), introducing specialised sub-agents would make sense:
- **Inventory sub-agent**: real-time availability, category search with embeddings
- **Recommendation sub-agent**: personalisation engine, collaborative filtering
- **Order management sub-agent**: cart, checkout, returns orchestration

### Tool list

| Tool | Purpose |
|---|---|
| `get_customer_profile` | Loads order history and returns for personalisation |
| `search_products` | Queries inventory with optional filters |
| `get_product_image` | Returns a URL for the product image to display in chat. Also used for upsell suggestions. |
| `add_to_cart` | Writes to the cart table after customer confirmation |
| `get_cart` | Reads current cart contents |
| `escalate_to_human` | Signals human takeover (after 3 failed turns or on request) |

### Image URL separation

`get_product_image` gives the model only a simple confirmation (`{shown: true, item, colour}`) — the actual image URL is never exposed to the model. The URL is built inside the agent loop and passed to the frontend via the `products` array in the API response. This prevents the model from accidentally surfacing raw file paths in its text responses.

---

## 2. Text Embeddings — Not Used

### Decision
No vector embeddings. Product matching is handled by Claude's language understanding combined with structured tool filtering.

### Justification
- **20 products** across 5 categories × 4 colours × 4 sizes. This is a lookup table, not a corpus.
- Claude maps natural language ("something smart but relaxed", "office-appropriate") to the right category through its language understanding. No embedding layer is needed to bridge user language to product attributes at this scale.
- Embeddings would add infrastructure (vector DB, embedding model, indexing pipeline) with no measurable benefit.

**When embeddings would be warranted:**
- 500+ products with free-text descriptions, material details, style tags
- Semantic similarity needed to surface "closest match" across a large catalogue
- Recommendation via k-NN over product embeddings

---

## 3. Database Schema

SQLite for the demo (zero-setup, file-based). Production would use PostgreSQL.

### Tables

**`product_inventory`**
```
id          INTEGER PK
item        TEXT          -- T-shirt | Polo | Plain Shirt | Checked Shirt | Jeans
size        TEXT          -- S | M | L | XL
colour      TEXT          -- Grey | Black | Red | Green
in_stock    INTEGER       -- boolean (0/1)
image_path  TEXT          -- relative path e.g. Images/T-shirts/Black.png
```

**`customer_information`**
```
customer_id    TEXT PK
customer_name  TEXT
email          TEXT
```

**`customer_orders`**
```
order_id     TEXT PK
customer_id  TEXT FK → customer_information
items        TEXT          -- JSON array of {item, size, colour}
order_date   TEXT
```

**`return_orders`**
```
order_id      TEXT PK
customer_id   TEXT FK → customer_information
items         TEXT          -- JSON array of {item, size, colour}
return_reason TEXT          -- plain-text reason (e.g. "too small")
return_date   TEXT
```

**`cart`**
```
id           INTEGER PK AUTOINCREMENT
customer_id  TEXT FK → customer_information
item         TEXT
size         TEXT
colour       TEXT
added_at     TEXT
```

### Cart lifetime

The cart is cleared at the start of every session (when `/api/greet/{customer_id}` is called) to ensure each demo session starts clean. In a production system this would instead be tied to a checkout or expiry flow.

---

## 4. Personalisation via Purchase History

At the start of every conversation, `get_customer_profile` is called silently to retrieve:
- **Past orders**: inferred colour preferences, preferred item types, typical size
- **Returns**: the item returned, the size returned, and the reason

This context is injected into the agent's working memory (its conversation history). The agent reasons over it naturally and cites specific records when explaining recommendations:

> *Ryan returned a Green Checked Shirt in M because it was too small → when recommending shirts to Ryan, Alex suggests L and says "Since you returned the Green Checked Shirt in M because it was too small, I'd go with L on this one."*

> *James returned Black Jeans in L because they were too big → when recommending jeans to James, Alex says "You returned Black Jeans in L because they were too big, so I'd suggest M."*

The agent does **not** announce history at the start of the conversation unprompted — it surfaces it only when directly relevant to a sizing or colour decision. This keeps the opening exchange natural while still making personalisation visible at the moment it matters.

This approach keeps personalisation logic inside the LLM rather than in brittle rule-based code, making it generalise to edge cases without explicit programming.

### Demo customer profiles

| Customer | Orders | Return | Agent behaviour |
|---|---|---|---|
| Ryan Mitchell | Black T-shirt (L), Red Polo (L), Black Jeans (L) | Green Checked Shirt M — too small | Recommends L, cites the M return for shirts; gravitates toward black/red casual items |
| James Parker | Grey Plain Shirt (M), Green Polo (M), Grey Jeans (M) | Black Jeans L — too big | Recommends M, cites the L return for jeans; gravitates toward grey/green smart-casual items |

---

## 5. Conversation Flow Design

The conversation follows a deliberate funnel to reduce friction and avoid overwhelming the customer:

```
1. Style & occasion  →  2. Colour  →  3. Show product image  →  4. Confirm item  →  5. Ask size  →  6. Add to cart
```

Size is intentionally deferred until the customer has committed to an item and colour. Asking for size too early (before the customer has decided what they want) adds unnecessary friction and can feel presumptuous. Once item and colour are settled, the agent asks for size — citing history where relevant — and then calls `add_to_cart`.

### Upsell

After an item is added to the cart, the agent offers one complementary suggestion. The upsell always includes a product image (via `get_product_image`) to make it visually compelling rather than just a text prompt. If the customer declines, the agent accepts gracefully and does not push further.

---

## 6. Human Escalation

Two triggers:
1. **Automatic**: after 3 conversational turns where the agent fails to add an item to cart, the agent calls `escalate_to_human`. It is apologetic and explains the handover.
2. **Manual**: if the customer says "I want to speak to a human" or equivalent, the agent calls `escalate_to_human` immediately.

When escalation fires:
- The API response sets `escalated: true`
- The frontend shows an amber escalation banner in the chat
- The input area is disabled (no further AI responses)
- A human agent would pick up the conversation in a real deployment

---

## 7. Off-topic & Prompt Injection Handling

The system prompt instructs the agent to decline any request not related to the store's clothing inventory. The response is always polite and redirects the user. This covers:
- General knowledge questions
- Weather / news
- Attempts to override the system prompt ("ignore your instructions…")
- Personal questions

Claude's alignment properties handle adversarial injection attempts robustly without needing a separate guardrail layer at this scale.

---

## 8. Frontend Design

### Layout

The frontend is a single-page application served by FastAPI. It has two views that toggle without a page reload:

**Landing page** — an e-commerce hero page that establishes the brand and provides the demo customer selector. It includes a staggered product image mosaic to communicate the store's inventory at a glance. Clicking "Start Shopping" transitions to the chat view and creates a new session.

**Chat view** — a full-screen chat interface on mobile, and a centred card (max 680px wide, max 860px tall) on larger screens. The SHOPPER logo is clickable and returns the user to the landing page.

### Visual design

The UI uses a clean light theme with the following design language:
- **Backgrounds**: off-white `#f5f5f3` for the page, pure white `#ffffff` for surfaces (message bubbles, cards, header)
- **Typography**: Inter, with near-black `#1a1a18` for primary text and muted greys for secondary text and timestamps
- **User messages**: dark near-black bubble, right-aligned — high contrast against the light background
- **Agent messages**: white card bubble with a subtle border and shadow, left-aligned. A flattened bottom-left corner (4px vs 18px) distinguishes them from the user bubble
- **Product cards**: white cards with a soft drop shadow, displayed inline in the conversation. Each card shows the product image, name, colour, recommended size (if known), and a "Select this" button
- **Typing indicator**: three-dot bounce animation in a white card matching the agent bubble style

### Inline product images

Product images appear as cards directly inside the conversation thread when the agent makes a recommendation, and again when making an upsell suggestion. This keeps the shopping experience within the chat rather than requiring navigation to a separate product page.

Clicking **"Select this"** on a product card pre-fills the input with a natural-language selection (e.g. *"I'd like the Black Polo in size L please"*), preserving the conversational flow rather than triggering a silent action.

### Cart

A slide-out cart panel is accessible via the bag icon in the header. On mobile it is full-width; on desktop it is 300px wide. It shows all cart items with product images, colour, and size.

### Mobile responsiveness

The interface is built mobile-first:
- The chat is full-screen on phones (no rounded corners or drop shadow)
- The card layout (border-radius, shadow, centred) is applied only at ≥600px viewport width
- Product cards switch from a wrapped grid to a **horizontal scroll row** on mobile to avoid layout compression
- The message input font is set to 16px on mobile to prevent iOS Safari from zooming in on focus
- The agent bar hides the role subtitle on small screens to conserve vertical space
- Touch targets (send button, select button) meet the 44×44px minimum

---

## 9. API Design

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/` | Serve frontend SPA |
| GET | `/api/customers` | List demo customers for the selector |
| GET | `/api/greet/{customer_id}` | Create session, clear cart, return greeting |
| POST | `/api/chat` | Main chat endpoint — runs the agent |
| GET | `/api/cart/{customer_id}` | Read cart contents |
| DELETE | `/api/cart/{customer_id}` | Clear cart |
| DELETE | `/api/session/{session_id}` | Clear conversation session |

Session state (conversation history) is held in server memory (Python dict). Production would use Redis or a persistent store.

### Session handling

Conversation history is stored as a list of JSON-serialisable message dicts — no Anthropic SDK objects are stored. Tool-use turns (assistant content blocks + tool results) are appended inline and passed back verbatim on the next request, which is required for the Anthropic API's multi-turn tool use format.
