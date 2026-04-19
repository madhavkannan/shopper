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
| `get_product_image` | Returns a URL for the product image to display in chat |
| `add_to_cart` | Writes to the cart table after customer confirmation |
| `get_cart` | Reads current cart contents |
| `escalate_to_human` | Signals human takeover (after 3 failed turns or on request) |

---

## 2. Text Embeddings — Not Used

### Decision
No vector embeddings. Product matching is handled by Claude's language understanding + structured tool filtering.

### Justification
- **20 products** across 5 categories × 4 colours × 4 sizes. This is a lookup table, not a corpus.
- Claude already maps natural language ("something smart but relaxed", "office-appropriate") to the right category via its language understanding. No embedding layer is needed to bridge user language to product attributes at this scale.
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

---

## 4. Personalisation via Persistent Memory

At the start of every conversation, `get_customer_profile` is called to retrieve:
- **Past orders**: inferred colour preferences, preferred item types, typical size
- **Returns**: the item returned, size returned, and the reason

This context is injected into the agent's working memory (its conversation history). The agent reasons over it naturally — for example:

> *Alice returned a Checked Shirt in size M because it was too small → when recommending checked shirts to Alice, suggest size L.*

> *Bob consistently orders Black items in size L → proactively suggest Black colourways and confirm L as a starting point.*

This approach keeps personalisation logic inside the LLM rather than in brittle rule-based code, making it generalise to edge cases without explicit programming.

---

## 5. Human Escalation

Two triggers:
1. **Automatic**: after 3 conversational turns where the agent fails to add an item to cart, the agent is instructed (via system prompt) to call `escalate_to_human`.
2. **Manual**: if the customer says "I want to speak to a human" or equivalent, the agent calls `escalate_to_human` immediately.

When escalation fires:
- The API response sets `escalated: true`
- The frontend shows a yellow escalation banner in the chat
- The input area is disabled (no further AI responses)
- A human agent would pick up the conversation in a real deployment

---

## 6. Off-topic & Prompt Injection Handling

The system prompt explicitly instructs the agent to decline any request not related to the store's clothing inventory. The response is always polite and redirects the user. This covers:
- General knowledge questions
- Weather / news
- Attempts to override the system prompt ("ignore your instructions…")
- Personal questions

Claude's alignment properties handle adversarial injection attempts robustly without needing a separate guardrail layer at this scale.

---

## 7. Frontend Design

Inspired by the Sierra.ai agent UI:
- **Dark premium aesthetic**: near-black backgrounds (#0f1422, #080c17) with layered depth
- **Card-based messages**: soft border + subtle shadow, not simple flat bubbles
- **Inline product cards**: images appear inside the conversation flow, not in a separate panel
- **"Select this" affordance**: clicking a product card pre-fills the input with a natural-language selection, keeping the conversation flow intact
- **Slide-out cart panel**: non-intrusive; opened on demand via the header cart button
- **Typing indicator**: three-dot bounce animation while the agent processes

---

## 8. API Design

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/` | Serve frontend SPA |
| GET | `/api/customers` | List demo customers for the selector |
| GET | `/api/greet/{customer_id}` | Create session, return personalised greeting |
| POST | `/api/chat` | Main chat endpoint — runs the agent |
| GET | `/api/cart/{customer_id}` | Read cart contents |
| DELETE | `/api/cart/{customer_id}` | Clear cart |
| DELETE | `/api/session/{session_id}` | Clear conversation session |

Session state (conversation history) is held in server memory (Python dict). Production would use Redis or a persistent store.
