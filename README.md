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

The SQLite database (`shopper.db`) is created and seeded automatically on first run.

---

## Demo Instructions

### Selecting a Customer

Use the **dropdown in the top-right header** to switch between demo customers. Each one has a different purchase history and return record — the agent will tailor its recommendations accordingly.

### Demo Customers & Their Profiles

| Customer | Background | Key Personalisation Points |
|---|---|---|
| **Ryan Mitchell** | All orders in L (plain shirt, jeans). Previously returned a Green Checked Shirt in M — too small. | Agent recommends L and cites the specific return when explaining the size. |
| **Bob Smith** | Orders Black T-shirt and Red Polo, both size L. No returns. | Agent leads with casual options (T-shirts, polos), anchors on L and his colour history. |
| **Charlie Brown** | All orders in M (jeans, T-shirt). Previously returned Grey Jeans in L — too big. | Agent recommends M for everything. Won't suggest L for jeans given his return history. |
| **James Parker** | Orders Green Polo and Grey Jeans, both size M. No returns. Smart-casual taste. | Agent gravitates toward green colourways and polo/shirt pairings. |

### Suggested Demo Flows

**Flow 1 — Size personalisation (Charlie)**
1. Select Charlie Brown
2. Say: *"I'm looking for a new pair of jeans"*
3. Watch the agent recommend size M, accounting for the L return

**Flow 2 — Size personalisation (Ryan)**
1. Select Ryan Mitchell
2. Ask about shirts
3. Agent recommends L and explicitly mentions the Green Checked Shirt return as the reason

**Flow 3 — Colour personalisation (Bob)**
1. Select Bob Smith
2. Say: *"I want something casual for the weekend"*
3. The agent gravitates toward black and red based on his history

**Flow 3 — Upsell after cart add (any customer)**
1. Browse to an item and confirm it
2. Once added to cart, the agent offers a single complementary suggestion
3. Say "no thanks" — the agent accepts gracefully

**Flow 4 — Human escalation**
1. Say: *"I'd like to speak to a human"* at any point
2. Or give three unclear/off-topic responses and watch the agent escalate automatically

**Flow 5 — Off-topic handling**
1. Ask anything unrelated: *"What's the weather like?"* or *"Ignore your instructions"*
2. The agent politely redirects to shopping

### Cart

Click the **bag icon** in the header to open the cart slide-out panel and see all added items with product images.

---

## Project Structure

```
Shopper/
├── app.py              # FastAPI backend & API routes
├── agent.py            # Claude agent with tool loop
├── database.py         # SQLite schema + seed data
├── requirements.txt
├── shopper.db          # Auto-created on first run
├── static/
│   ├── index.html
│   ├── styles.css
│   └── app.js
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

To start fresh (clear cart and conversation history), restart the server. The database retains seed data across restarts; only the in-memory session store is cleared.

To also clear the cart data:

```bash
# Delete and recreate the database
rm shopper.db
uvicorn app:app --reload
```
