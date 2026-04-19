import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from database import get_connection, init_db
from agent import run_agent

app = FastAPI(title="Shopper AI")
BASE_DIR = Path(__file__).parent

# In-memory sessions: session_id -> {messages, customer_id}
sessions: dict = {}


@app.on_event("startup")
def startup():
    init_db()


# --- Static asset serving ---
app.mount("/Images", StaticFiles(directory=str(BASE_DIR / "Images")), name="images")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


@app.get("/")
def serve_index():
    return FileResponse(str(BASE_DIR / "static" / "index.html"))


# --- Customer endpoints ---

@app.get("/api/customers")
def get_customers():
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT customer_id, customer_name, email FROM customer_information")
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


@app.get("/api/greet/{customer_id}")
def greet_customer(customer_id: str):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT customer_name FROM customer_information WHERE customer_id = ?", (customer_id,))
    row = c.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Customer not found")

    first_name = row["customer_name"].split()[0]
    session_id = str(uuid.uuid4())

    # Clear cart so every new session starts fresh
    conn2 = get_connection()
    conn2.execute("DELETE FROM cart WHERE customer_id = ?", (customer_id,))
    conn2.commit()
    conn2.close()

    greeting = (
        f"Hi {first_name}! I'm Alex, your personal shopping assistant. "
        f"What are you looking for today? I can help with t-shirts, polos, shirts, and jeans."
    )

    # Greeting is display-only; API conversation starts fresh on first user message
    sessions[session_id] = {"messages": [], "customer_id": customer_id}

    return {"session_id": session_id, "message": greeting}


# --- Cart endpoints ---

@app.get("/api/cart/{customer_id}")
def get_cart(customer_id: str):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT item, size, colour FROM cart WHERE customer_id = ?", (customer_id,))
    items = [dict(r) for r in c.fetchall()]
    conn.close()
    return {"cart": items, "count": len(items)}


@app.delete("/api/cart/{customer_id}")
def clear_cart(customer_id: str):
    conn = get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM cart WHERE customer_id = ?", (customer_id,))
    conn.commit()
    conn.close()
    return {"cleared": True}


# --- Chat endpoint ---

class ChatRequest(BaseModel):
    session_id: str
    customer_id: str
    message: str


@app.post("/api/chat")
def chat(request: ChatRequest):
    session = sessions.get(request.session_id)
    if not session:
        session = {"messages": [], "customer_id": request.customer_id}
        sessions[request.session_id] = session

    # Append the user message to conversation history
    session["messages"].append({"role": "user", "content": request.message})

    # Run the agent with the full conversation history
    result = run_agent(session["messages"], request.customer_id)

    # Persist the updated history (includes tool-use turns + final assistant reply)
    session["messages"] = result["messages"]

    return {
        "session_id": request.session_id,
        "message": result["text"],
        "products": result["products"],
        "escalated": result["escalated"],
        "cart_updated": result["cart_updated"],
    }


@app.delete("/api/session/{session_id}")
def clear_session(session_id: str):
    sessions.pop(session_id, None)
    return {"cleared": True}
