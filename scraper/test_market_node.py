import sqlite3
import market_node


def test_market_exclusion():
    assert market_node.is_market_excluded({"details": {"Zustand": "Defekt"}}) is True
    assert market_node.is_market_excluded({"details": {"zustand": "defekt"}}) is True
    assert market_node.is_market_excluded({"details": {"Zustand": "Sehr Gut"}}) is False

    assert (
        market_node.is_market_excluded({"title": "MacBook Pro 15 defekt an Bastler"})
        is True
    )
    assert (
        market_node.is_market_excluded(
            {"title": "Yamaha R1 Bastlerfahrzeug ohne Motor"}
        )
        is True
    )
    assert market_node.is_market_excluded({"title": "Laptop gesucht z.B. Dell"}) is True
    assert (
        market_node.is_market_excluded(
            {"short_description": "Nur für Bastler oder Schlachtung"}
        )
        is True
    )

    assert market_node.is_market_excluded({"fit": {"verdict": "no"}}) is True
    assert market_node.is_market_excluded({"fit": {"verdict": "fit"}}) is False

    assert market_node.is_market_excluded({"price_eur": 0}) is True
    assert market_node.is_market_excluded({"price_eur": -10}) is True
    assert market_node.is_market_excluded({"price_eur": 150}) is False


def test_resolve_node_categories():
    # Cars
    car_facts = {"criteria": {"make": {"value": "BMW"}, "model": {"value": "320d"}}}
    node, source = market_node.resolve_node(
        {}, facts=car_facts, playbook_key="vehicles/cars"
    )
    assert node == "auto/bmw/320d"
    assert source == "identity"

    # Motorcycles
    bike_facts = {"criteria": {"make": "Yamaha", "model": "YZF-R1"}}
    node, source = market_node.resolve_node(
        {}, facts=bike_facts, playbook_key="vehicles/motorcycles"
    )
    assert node == "motorrad/yamaha/yzf-r1"
    assert source == "identity"

    # Laptops
    laptop_facts = {
        "criteria": {
            "brand": {"value": "Lenovo"},
            "modelName": {"value": "ThinkPad T14"},
        }
    }
    node, source = market_node.resolve_node(
        {}, facts=laptop_facts, playbook_key="electronics/laptops"
    )
    assert node == "laptop/lenovo/thinkpad-t14"
    assert source == "identity"

    # RAM
    ram_facts = {
        "criteria": {
            "generation": {"value": "ddr4"},
            "stickCount": {"value": 2},
            "gbPerStick": {"value": 16},
        }
    }
    node, source = market_node.resolve_node(
        {}, facts=ram_facts, playbook_key="computing/memory"
    )
    assert node == "ram/ddr4/2x16gb"
    assert source == "playbook"

    # Rank node takes priority
    node, source = market_node.resolve_node(
        {},
        facts=ram_facts,
        playbook_key="computing/memory",
        rank_node="custom/rank-node",
    )
    assert node == "custom/rank-node"
    assert source == "rank"

    # Fallback to hunt
    node, source = market_node.resolve_node({}, hunt_fallback="corsair-ram")
    assert node == "corsair-ram"
    assert source == "hunt"


def test_db_storage():
    conn = sqlite3.connect(":memory:")
    market_node.ensure_schema(conn)

    market_node.put_node(conn, "listing_123", "ram/ddr4/2x16gb", source="playbook")
    stored = market_node.get_node(conn, "listing_123")
    assert stored["node_key"] == "ram/ddr4/2x16gb"
    assert stored["source"] == "playbook"

    assert market_node.get_node(conn, "listing_unknown") is None
    conn.close()
