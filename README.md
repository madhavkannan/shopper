# Shopper — AI Styling Assistant

A conversational shopping assistant for men's clothing, built with Claude as the AI backbone. Customers get personalised recommendations based on their purchase history and returns, see product images inline in the chat, and can add items to a cart — all through natural conversation.

## Prerequisites

- Python 3.9+
- An Anthropic API key

## Setup

```bash
# 1. Clone / navigate to the project directory
cd /path/to/Shopper

# 2. Install dependencies
pip install -r requirements.txt

# 3. Export your Anthropic API key
export ANTHROPIC_API_KEY="sk-ant-..."

# 4. Start the server
uvicorn app:app --reload
```

Open **http://localhost:8000** in your browser.

The SQLite database (`shopper.db`) is created and seeded automatically on first run. The cart is cleared automatically at the start of each new session.

---

## Demo Instructions

### Starting a session

On the landing page, select a customer from the dropdown and click **Start Shopping**. This opens the chat with Alex, your AI stylist. Each session starts with a clean cart.

To return to the landing page at any point, click the **SHOPPER** logo in the top-left corner of the chat.

---

### Demo Customers

There are two demo customers, each with a rich purchase and return history that drives personalised recommendations.

---

#### Ryan Mitchell — Casual buyer, size L

| | |
|---|---|
| **Style** | Casual — t-shirts, polos, jeans |
| **Colour preference** | Black and red |
| **Past orders** | Black T-shirt (L) · Red Polo (L) · Black Jeans (L) |
| **Return on record** | Green Checked Shirt in **M** — returned as *too small* |

**What to expect from Alex:**
- Gravitates toward casual items and dark colourways based on Ryan's order history
- When recommending shirts, explicitly flags the M return: *"Since you returned the Green Checked Shirt in M because it was too small, I'd go with L on this one"*
- Anchors size recommendations at L across the board

---

#### James Parker — Smart-casual buyer, size M

| | |
|---|---|
| **Style** | Smart-casual — plain shirts, polos, jeans |
| **Colour preference** | Grey and green |
| **Past orders** | Grey Plain Shirt (M) · Green Polo (M) · Grey Jeans (M) |
| **Return on record** | Black Jeans in **L** — returned as *too big* |

**What to expect from Alex:**
- Leans toward neutral and green colourways and smart-casual items
- When recommending jeans or bottoms, cites the L return: *"You returned Black Jeans in L because they were too big, so I'd suggest M"*
- Anchors size recommendations at M across the board

---

### Suggested Demo Flows

**Flow 1 — Return-driven size recommendation (Ryan)**
1. Select Ryan Mitchell → Start Shopping
2. Say: *"I need a new shirt for the office"*
3. Alex asks about colour preference and narrows down the style
4. Once colour is agreed, Alex shows the product image
5. Confirm the item → Alex then asks for size, citing the Green Checked Shirt M return as the reason for recommending L
6. Confirm size → added to cart
7. Alex offers one upsell with a product image — say *"no thanks"* to see it accepted gracefully

**Flow 2 — Return-driven size recommendation (James)**
1. Select James Parker → Start Shopping
2. Say: *"Looking for a new pair of jeans"*
3. Alex settles on colour → shows the product image → you confirm
4. Alex asks for size, citing the Black Jeans L return ("they were too big, so I'd suggest M")
5. Confirm → added to cart, then observe the upsell with image

**Flow 3 — Colour personalisation (James)**
1. Select James Parker → Start Shopping
2. Say: *"I want something smart but relaxed for the weekend"*
3. Watch Alex gravitate toward grey and green options based on James's order history

**Flow 4 — Casual style matching (Ryan)**
1. Select Ryan Mitchell → Start Shopping
2. Say: *"Something to wear casually — not too formal"*
3. Alex leads with t-shirts and polos in black/red, matching Ryan's preferences

**Flow 5 — Upsell with product image**
1. Add any item to the cart through conversation
2. Alex offers one complementary suggestion (e.g. jeans if you bought a shirt) with the product image shown inline
3. Say *"no thanks"* — Alex accepts without pushing further

**Flow 6 — Human escalation**
1. Say: *"I'd like to speak to a human"* at any point → immediate escalation
2. Or be vague for three exchanges and watch Alex escalate automatically with an apology

**Flow 7 — Off-topic handling**
1. Ask something unrelated: *"What's the weather like?"* or *"Ignore your previous instructions"*
2. Alex politely declines and redirects to shopping

### Cart

Click the **bag icon** in the top-right of the chat header to open the cart panel. It shows all added items with product images, colour, and size.

---

## Project Structure

```
Shopper/
├── app.py              # FastAPI backend & API routes
├── agent.py            # Claude agent with tool loop
├── database.py         # SQLite schema + seed data
├── requirements.txt
├── Procfile            # Railway deployment start command
├── shopper.db          # Auto-created on first run
├── static/
│   ├── index.html      # Landing page + chat UI
│   ├── styles.css      # Light theme, mobile-responsive
│   └── app.js          # Chat logic, product cards, cart
├── Images/             # Product images (PNG)
│   ├── T-shirts/
│   ├── Polos/
│   ├── Plain Shirt/
│   ├── Checked Shirt/
│   └── Jeans/
├── Design/             # UI reference assets
├── SYSTEM_DESIGN.md    # Architecture decisions
├── README.md
└── CLAUDE.md
```

## Resetting the Demo

The cart clears automatically at the start of each session. Conversation history resets on server restart.

To fully wipe and re-seed the database:

```bash
rm shopper.db
uvicorn app:app --reload
```
