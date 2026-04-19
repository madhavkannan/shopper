# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

A conversational AI shopping assistant for a men's clothing store. Customers get personalised recommendations powered by Claude, see product images inline in the chat, and add items to a cart through natural conversation.

## Running the Project

```bash
# Install dependencies
pip install -r requirements.txt

# Set API key
export ANTHROPIC_API_KEY="sk-ant-..."

# Start server (auto-reloads on code changes)
uvicorn app:app --reload
```

Access at **http://localhost:8000**. The SQLite database is created and seeded automatically on first run.

To reset: `rm shopper.db` then restart the server.

## Architecture

**Backend**: FastAPI (`app.py`) + SQLite (`database.py`) + Claude agent (`agent.py`)  
**Frontend**: Vanilla JS single-page app in `static/`  
**Model**: `claude-sonnet-4-6` via the Anthropic SDK

### Agent design (`agent.py`)

Single **orchestrator agent with tools** — one Claude call per user turn, extended by a tool-use loop until `stop_reason == "end_turn"`. Tools:

| Tool | What it does |
|---|---|
| `get_customer_profile` | Fetches order history + returns from SQLite for personalisation |
| `search_products` | Queries inventory with optional item/size/colour filters |
| `get_product_image` | Returns a `/Images/…` URL so the frontend renders the image |
| `add_to_cart` | Writes to the `cart` table after customer confirmation |
| `get_cart` | Reads cart contents |
| `escalate_to_human` | Sets `escalated=true` in the response; frontend disables input |

Conversation history is kept in a server-side dict (`sessions`) keyed by UUID session ID. Each entry is a list of JSON-serialisable message dicts (no SDK objects stored). Tool-use turns (assistant content blocks + tool results) are appended inline and passed back verbatim on the next request.

### API routes (`app.py`)

- `GET /api/customers` — list all demo customers
- `GET /api/greet/{customer_id}` — create session, return greeting
- `POST /api/chat` — main chat endpoint; runs the agent
- `GET /api/cart/{customer_id}` — read cart
- `DELETE /api/cart/{customer_id}` — clear cart

### Database (`database.py`)

Five tables: `product_inventory`, `customer_information`, `customer_orders`, `return_orders`, `cart`.  
`init_db()` creates and seeds all tables on first run (idempotent — skips if rows exist).  
`ITEM_FOLDER` dict maps product names to their image directory names (e.g. `"T-shirt"` → `"T-shirts"`).

### Frontend (`static/`)

- `index.html` — shell with header, chat area, input, cart slide-out panel
- `styles.css` — dark Sierra.ai-inspired theme (near-black backgrounds, blue accents)
- `app.js` — fetch-based chat loop; renders messages, product cards, typing indicator, cart panel

Product cards appear inline in the conversation. Clicking "Select this" pre-fills the message input with a natural-language selection string.

## Key Conventions

- `_blocks_to_dicts(content)` in `agent.py` converts Anthropic SDK content blocks to plain dicts before storing in session — required for JSON serialisation and for passing history back to the API.
- Image URLs use `urllib.parse.quote()` on the folder name to handle spaces in `"Plain Shirt"` and `"Checked Shirt"`.
- The greeting message from `/api/greet` is display-only and is NOT included in the API conversation history (Anthropic requires conversations to start with a user turn).

## Demo Customers

| ID | Name | Key history |
|---|---|---|
| CUST001 | Ryan Mitchell | Returned Checked Shirt M (too small) → all orders in L; agent cites the return when recommending L |
| CUST002 | Bob Smith | Buys Black/Red casual items in L; no returns |
| CUST003 | Charlie Brown | Returned Jeans L (too big) → all orders in M; agent suggests M |
| CUST004 | James Parker | Smart-casual: green polo M, grey jeans M; no returns |

All names are male (menswear store). If changing customers, maintain this constraint.

## Key Design Decisions

- **Landing page first**: `index.html` shows a two-column e-commerce landing page; the chat is a hidden `div` that becomes visible after "Start Shopping".
- **Logo click resets**: clicking the SHOPPER logo in the chat header returns to the landing page (no page reload).
- **History is silent**: the agent fetches customer profile at conversation start but does NOT proactively announce past orders. It only references history when directly relevant to a sizing/colour recommendation.
- **Image URLs hidden from model**: `get_product_image` in `agent.py` gives the model a simple `{shown: true, item, colour}` confirmation; the actual image URL is computed in the `run_agent` loop and only sent to the frontend via the `products` array in the API response.
- **Size in Select button**: `get_product_image` accepts an optional `recommended_size` param; the frontend includes it in the pre-filled message when the user clicks "Select this".
- **Light theme**: CSS uses CSS custom properties (`--bg`, `--surface`, `--text`, etc.) for easy theming. Agent messages are plain text (no bubble) following the design reference style.
