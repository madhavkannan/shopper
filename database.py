import sqlite3
import json
from pathlib import Path

DB_PATH = Path(__file__).parent / "shopper.db"

ITEM_FOLDER = {
    "T-shirt": "T-shirts",
    "Polo": "Polos",
    "Plain Shirt": "Plain Shirt",
    "Checked Shirt": "Checked Shirt",
    "Jeans": "Jeans",
}


def get_connection():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS product_inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item TEXT NOT NULL,
            size TEXT NOT NULL,
            colour TEXT NOT NULL,
            in_stock INTEGER DEFAULT 1,
            image_path TEXT NOT NULL
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS customer_information (
            customer_id TEXT PRIMARY KEY,
            customer_name TEXT NOT NULL,
            email TEXT NOT NULL
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS customer_orders (
            order_id TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL,
            items TEXT NOT NULL,
            order_date TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (customer_id) REFERENCES customer_information(customer_id)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS return_orders (
            order_id TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL,
            items TEXT NOT NULL,
            return_reason TEXT NOT NULL,
            return_date TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (customer_id) REFERENCES customer_information(customer_id)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS cart (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id TEXT NOT NULL,
            item TEXT NOT NULL,
            size TEXT NOT NULL,
            colour TEXT NOT NULL,
            added_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (customer_id) REFERENCES customer_information(customer_id)
        )
    """)

    conn.commit()
    _seed_data(conn)
    conn.close()


def _seed_data(conn):
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM product_inventory")
    if c.fetchone()[0] > 0:
        return

    items = list(ITEM_FOLDER.keys())
    sizes = ["S", "M", "L", "XL"]
    colours = ["Grey", "Black", "Red", "Green"]

    for item in items:
        for size in sizes:
            for colour in colours:
                folder = ITEM_FOLDER[item]
                image_path = f"Images/{folder}/{colour}.png"
                c.execute(
                    "INSERT INTO product_inventory (item, size, colour, in_stock, image_path) VALUES (?, ?, ?, 1, ?)",
                    (item, size, colour, image_path),
                )

    customers = [
        ("CUST001", "Ryan Mitchell", "ryan@example.com"),
        ("CUST002", "James Parker", "james@example.com"),
    ]
    c.executemany(
        "INSERT OR IGNORE INTO customer_information VALUES (?, ?, ?)", customers
    )

    # Ryan: casual buyer, loves black/red — 3 orders all L.
    #   Returned a Green Checked Shirt in M (too small) → agent cites this when recommending L for shirts.
    # James: smart-casual, prefers grey/green — 3 orders all M.
    #   Returned Black Jeans in L (too big) → agent cites this when recommending M for jeans.
    orders = [
        ("ORD001", "CUST001", json.dumps([{"item": "T-shirt",  "size": "L", "colour": "Black"}])),
        ("ORD002", "CUST001", json.dumps([{"item": "Polo",     "size": "L", "colour": "Red"}])),
        ("ORD003", "CUST001", json.dumps([{"item": "Jeans",    "size": "L", "colour": "Black"}])),
        ("ORD004", "CUST002", json.dumps([{"item": "Plain Shirt", "size": "M", "colour": "Grey"}])),
        ("ORD005", "CUST002", json.dumps([{"item": "Polo",     "size": "M", "colour": "Green"}])),
        ("ORD006", "CUST002", json.dumps([{"item": "Jeans",    "size": "M", "colour": "Grey"}])),
    ]
    c.executemany(
        "INSERT OR IGNORE INTO customer_orders (order_id, customer_id, items) VALUES (?, ?, ?)",
        orders,
    )

    returns = [
        (
            "RET001",
            "CUST001",
            json.dumps([{"item": "Checked Shirt", "size": "M", "colour": "Green"}]),
            "Sizing issue — too small. Needed a size up to L.",
        ),
        (
            "RET002",
            "CUST002",
            json.dumps([{"item": "Jeans", "size": "L", "colour": "Black"}]),
            "Wrong size — too big. Exchanged for size M.",
        ),
    ]
    c.executemany(
        "INSERT OR IGNORE INTO return_orders (order_id, customer_id, items, return_reason) VALUES (?, ?, ?, ?)",
        returns,
    )

    conn.commit()
