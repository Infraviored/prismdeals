"""Search families as first-class rows, cross-product expansion, and shared search ownership.

A search family is not a new kind of scraping job. It is one buyer intent
expressed across several model variants or alternative keywords — one search
per (term × location) combination. The rest of the pipeline (crawling,
extraction, scoring) continues to operate on ordinary `searches` rows.

Three constraints shape this store:

1. Cross-Product Composition:
   A corridor fans out on locations (circles); a family fans out on terms.
   Composing them yields terms × circles searches. A corridor without a family
   is the special case of a single term (the base URL's query); a family without
   a corridor is the special case of a single location (the base URL's place).
   The `expand` function computes this Cartesian product purely, without database
   side effects, enabling accurate crawl time and count previews.

2. Shared Search Row Ownership (recompute_enabled):
   Because `searches.url` is UNIQUE, two families (or a family and a corridor)
   searching the same term at the same place share a single row. If one family
   is disabled, the other must keep scraping. A search row is enabled if at
   least one active owner wants it. A row with no owners is manually created and
   is never automatically toggled, preventing the bug described in C-3 of
   PROPOSALS.md.

3. Conflict Transparency:
   Reusing an existing search row with a conflicting campaign, conflicting
   knowledge set, or disabled state is recorded and reported as a conflict
   rather than silently ignored, matching the safety model of `route_store.py`.
"""

import datetime
import json
import logging
import sqlite3

from search_url import slugify, with_location, with_query

logger = logging.getLogger(__name__)


def _now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def expand(base_url, terms=None, circles=None):
    """Computes the Cartesian product of search terms and locations without side effects.

    - A family without a route: terms × [base_url location] -> N searches
    - A route without a family: [base_url query] × circles -> N searches
    - Both: terms × circles -> N × M searches

    Yields tuples of: (term_id, url, label)
    """
    # 1. Normalize terms into (term_id, term_slug, term_label)
    if terms is None or len(terms) == 0:
        terms_list = [(None, None, None)]
    else:
        terms_list = []
        for t in terms:
            if isinstance(t, str):
                terms_list.append((None, slugify(t), t.strip()))
            elif isinstance(t, dict):
                tid = t.get("id")
                raw_term = t.get("term", "")
                slug = slugify(raw_term)
                label = t.get("label") or raw_term
                terms_list.append((tid, slug, label))
            elif isinstance(t, (tuple, list)):
                # (id, term, label) or (term, label)
                if len(t) >= 3:
                    terms_list.append((t[0], slugify(t[1]), t[2] or t[1]))
                elif len(t) == 2:
                    terms_list.append((None, slugify(t[0]), t[1] or t[0]))
                else:
                    terms_list.append((None, slugify(t[0]), t[0]))
            else:
                tid = getattr(t, "id", None)
                raw_term = getattr(t, "term", "")
                slug = slugify(raw_term)
                label = getattr(t, "label", None) or raw_term
                terms_list.append((tid, slug, label))

    # 2. Normalize circles
    if circles is None or len(circles) == 0:
        circles_list = [None]
    else:
        circles_list = list(circles)

    # 3. Cross-product
    for term_id, term_slug, term_label in terms_list:
        if term_slug is not None:
            query_url = with_query(base_url, term_slug)
        else:
            query_url = base_url

        for circle in circles_list:
            if circle is not None:
                if hasattr(circle, "location_id"):
                    loc_id = circle.location_id
                    radius = circle.radius_km
                    c_label = circle.label
                elif isinstance(circle, dict):
                    loc_id = circle.get("location_id")
                    radius = circle.get("radius_km")
                    c_label = circle.get("label", "")
                else:
                    # tuple: (loc_id, radius, label)
                    loc_id, radius, c_label = (
                        circle[0],
                        circle[1],
                        circle[2] if len(circle) > 2 else "",
                    )

                final_url = with_location(query_url, loc_id, radius)
            else:
                final_url = query_url
                c_label = None

            if term_label and c_label:
                label = f"{term_label} · {c_label}"
            elif term_label:
                label = term_label
            elif c_label:
                label = c_label
            else:
                label = final_url

            yield (term_id, final_url, label)


def recompute_enabled(conn, search_ids, cursor=None):
    """Recalculates the enabled flag for the given search ids based on active ownership.

    Rule from docs/plan-search-families.md:
    A searches row is enabled if at least one active owner wants it.
    A row with NO owners is considered manually created and is never automatically
    switched (resolves C-3 from PROPOSALS.md).

    Owners are:
    1. search_family_searches: active when both the family and the term are enabled.
    2. route_search_circles: active when the route has no family (family_id IS NULL)
       or when its family is enabled.
    """
    if not search_ids:
        return {}

    sids = list({int(s) for s in search_ids if s is not None})
    if not sids:
        return {}

    if cursor is None:
        cursor = conn.cursor()

    placeholders = ",".join("?" for _ in sids)

    # 1. Family owners
    family_rows = cursor.execute(
        f"""
        SELECT sfs.search_id,
               COUNT(*) AS total,
               SUM(CASE WHEN f.enabled = 1 AND t.enabled = 1 THEN 1 ELSE 0 END) AS active
        FROM search_family_searches sfs
        JOIN search_families f ON f.id = sfs.family_id
        JOIN search_family_terms t ON t.id = sfs.term_id
        WHERE sfs.search_id IN ({placeholders})
        GROUP BY sfs.search_id
        """,
        sids,
    ).fetchall()
    family_counts = {row[0]: (row[1], row[2] or 0) for row in family_rows}

    # 2. Route owners
    route_rows = cursor.execute(
        f"""
        SELECT rsc.search_id,
               COUNT(*) AS total,
               SUM(CASE WHEN r.family_id IS NULL OR f.enabled = 1 THEN 1 ELSE 0 END) AS active
        FROM route_search_circles rsc
        JOIN route_searches r ON r.id = rsc.route_search_id
        LEFT JOIN search_families f ON f.id = r.family_id
        WHERE rsc.search_id IN ({placeholders})
        GROUP BY rsc.search_id
        """,
        sids,
    ).fetchall()
    route_counts = {row[0]: (row[1], row[2] or 0) for row in route_rows}

    results = {}
    for sid in sids:
        fam_tot, fam_act = family_counts.get(sid, (0, 0))
        rt_tot, rt_act = route_counts.get(sid, (0, 0))
        total_owners = fam_tot + rt_tot
        active_owners = fam_act + rt_act

        if total_owners == 0:
            # Unowned searches were created by hand. Do not toggle automatically.
            continue

        new_enabled = 1 if active_owners > 0 else 0
        cursor.execute(
            "UPDATE searches SET enabled = ? WHERE id = ?", (new_enabled, sid)
        )
        results[sid] = new_enabled

    conn.commit()
    return results


def preview_family(
    conn, base_url, terms, route_search_id=None, campaign_id=None, knowledge_set_id=None
):
    """Calculates preview metrics for a search family without database mutations."""
    circles = None
    cursor = conn.cursor()
    if route_search_id:
        row = cursor.execute(
            "SELECT plan_json, campaign_id, knowledge_set_id FROM route_searches WHERE id = ?",
            (route_search_id,),
        ).fetchone()
        if row:
            plan_data = json.loads(row[0])
            circles = plan_data.get("circles", [])
            if campaign_id is None:
                campaign_id = row[1]
            if knowledge_set_id is None:
                knowledge_set_id = row[2]

    expanded = list(expand(base_url, terms, circles))

    urls_out = []
    conflicts = []
    new_searches = 0
    reused_searches = 0

    # Build map for looking up original term string by slug
    term_strings = {}
    for t in terms:
        if isinstance(t, str):
            term_strings[slugify(t)] = t
        elif isinstance(t, dict):
            term_strings[slugify(t.get("term", ""))] = t.get("term", "")

    for term_id, url, label in expanded:
        existing = cursor.execute(
            "SELECT id, campaign_id, knowledge_set_id, enabled FROM searches WHERE url = ?",
            (url,),
        ).fetchone()

        # Find matching term string
        term_val = label
        for s, orig in term_strings.items():
            if s in url:
                term_val = orig
                break

        if existing is not None:
            reused_searches += 1
            exists = True
            search_id, ex_camp, ex_ks, enabled = existing
            mismatch = []
            if knowledge_set_id is not None and ex_ks != knowledge_set_id:
                mismatch.append(f"knowledge set {ex_ks} instead of {knowledge_set_id}")
            if campaign_id is not None and ex_camp != campaign_id:
                mismatch.append(f"campaign {ex_camp} instead of {campaign_id}")
            if not enabled:
                mismatch.append("disabled")
            if mismatch:
                conflicts.append(
                    {
                        "url": url,
                        "search_id": search_id,
                        "label": label,
                        "reasons": mismatch,
                    }
                )
        else:
            new_searches += 1
            exists = False

        urls_out.append(
            {
                "term": term_val,
                "label": label,
                "url": url,
                "exists": exists,
            }
        )

    # Scraper performance estimates: 2 pages per search, 2 seconds delay per page
    pages_to_scrape = 2
    delay_between_pages = 2
    total_searches = len(expanded)
    total_pages = total_searches * pages_to_scrape
    estimated_seconds = total_pages * delay_between_pages

    return {
        "terms": len(terms),
        "circles": len(circles) if circles else 1,
        "searches": total_searches,
        "new_searches": new_searches,
        "reused_searches": reused_searches,
        "pages": total_pages,
        "estimated_seconds": estimated_seconds,
        "urls": urls_out,
        "conflicts": conflicts,
    }


def attach_terms(
    conn,
    family_id,
    terms,
    circles=None,
    campaign_id=None,
    knowledge_set_id=None,
    route_search_id=None,
):
    """Materialises searches for (terms × circles) and registers family ownership."""
    cursor = conn.cursor()
    family_row = cursor.execute(
        "SELECT base_url, campaign_id, knowledge_set_id FROM search_families WHERE id = ?",
        (family_id,),
    ).fetchone()
    if not family_row:
        raise ValueError(f"Search family {family_id} not found")

    base_url, fam_camp, fam_ks = family_row
    if campaign_id is None:
        campaign_id = fam_camp
    if knowledge_set_id is None:
        knowledge_set_id = fam_ks

    expanded = list(expand(base_url, terms, circles))
    conflicts = []
    affected_search_ids = set()

    for term_id, url, label in expanded:
        existing = cursor.execute(
            "SELECT id, campaign_id, knowledge_set_id, enabled FROM searches WHERE url = ?",
            (url,),
        ).fetchone()

        if existing is None:
            try:
                cursor.execute(
                    "INSERT INTO searches (campaign_id, name, url, enabled, knowledge_set_id) "
                    "VALUES (?, ?, ?, 1, ?)",
                    (campaign_id, label, url, knowledge_set_id),
                )
                search_id = cursor.lastrowid
            except sqlite3.IntegrityError:
                existing = cursor.execute(
                    "SELECT id, campaign_id, knowledge_set_id, enabled FROM searches WHERE url = ?",
                    (url,),
                ).fetchone()
                if existing:
                    search_id = existing[0]
                else:
                    continue
        else:
            search_id, ex_camp, ex_ks, enabled = existing
            mismatch = []
            if knowledge_set_id is not None and ex_ks != knowledge_set_id:
                mismatch.append(f"knowledge set {ex_ks} instead of {knowledge_set_id}")
            if campaign_id is not None and ex_camp != campaign_id:
                mismatch.append(f"campaign {ex_camp} instead of {campaign_id}")
            if not enabled:
                mismatch.append("disabled")
            if mismatch:
                conflicts.append(
                    {
                        "url": url,
                        "search_id": search_id,
                        "label": label,
                        "reasons": mismatch,
                    }
                )

        if term_id is not None:
            cursor.execute(
                "INSERT OR IGNORE INTO search_family_searches (family_id, term_id, search_id) "
                "VALUES (?, ?, ?)",
                (family_id, term_id, search_id),
            )

        if route_search_id is not None and circles is not None:
            # Also record in route_search_circles if not present
            cursor.execute(
                "INSERT OR IGNORE INTO route_search_circles "
                "(route_search_id, search_id, location_id, label, radius_km) "
                "VALUES (?, ?, ?, ?, ?)",
                (route_search_id, search_id, None, label, None),
            )

        affected_search_ids.add(search_id)

    recompute_enabled(conn, affected_search_ids)
    return conflicts


def save_family(
    conn,
    name,
    base_url,
    terms,
    campaign_id=None,
    knowledge_set_id=None,
    route_search_id=None,
):
    """Creates a new search family, persists its terms, and attaches the search cross-product."""
    cursor = conn.cursor()
    now_ts = _now()
    cursor.execute(
        "INSERT INTO search_families (name, campaign_id, knowledge_set_id, base_url, enabled, created_at) "
        "VALUES (?, ?, ?, ?, 1, ?)",
        (name, campaign_id, knowledge_set_id, base_url, now_ts),
    )
    family_id = cursor.lastrowid

    circles = None
    if route_search_id:
        cursor.execute(
            "UPDATE route_searches SET family_id = ? WHERE id = ?",
            (family_id, route_search_id),
        )
        row = cursor.execute(
            "SELECT plan_json FROM route_searches WHERE id = ?",
            (route_search_id,),
        ).fetchone()
        if row:
            plan_data = json.loads(row[0])
            circles = plan_data.get("circles", [])

    stored_terms = []
    for pos, item in enumerate(terms):
        if isinstance(item, str):
            t_raw = item
            lbl = item
            en = 1
        elif isinstance(item, dict):
            t_raw = item.get("term", "")
            lbl = item.get("label") or t_raw
            en = item.get("enabled", 1)
        else:
            t_raw = str(item)
            lbl = t_raw
            en = 1

        slug = slugify(t_raw)
        cursor.execute(
            "INSERT INTO search_family_terms (family_id, term, label, enabled, position) "
            "VALUES (?, ?, ?, ?, ?)",
            (family_id, slug, lbl, 1 if en else 0, pos),
        )
        term_id = cursor.lastrowid
        stored_terms.append({"id": term_id, "term": slug, "label": lbl})

    conflicts = attach_terms(
        conn,
        family_id,
        stored_terms,
        circles=circles,
        campaign_id=campaign_id,
        knowledge_set_id=knowledge_set_id,
        route_search_id=route_search_id,
    )

    searches_count = cursor.execute(
        "SELECT COUNT(DISTINCT search_id) FROM search_family_searches WHERE family_id = ?",
        (family_id,),
    ).fetchone()[0]

    conn.commit()
    return family_id, searches_count, conflicts


def update_family(conn, family_id, name=None, enabled=None, terms=None):
    """Updates an existing search family, reconciling terms and ownership."""
    cursor = conn.cursor()
    fam = cursor.execute(
        "SELECT id, name, enabled, base_url, campaign_id, knowledge_set_id FROM search_families WHERE id = ?",
        (family_id,),
    ).fetchone()
    if not fam:
        raise ValueError(f"No search family with id {family_id}")

    campaign_id = fam[4]
    knowledge_set_id = fam[5]

    if name is not None:
        cursor.execute(
            "UPDATE search_families SET name = ? WHERE id = ?", (name, family_id)
        )

    family_enabled_changed = False
    if enabled is not None:
        cursor.execute(
            "UPDATE search_families SET enabled = ? WHERE id = ?",
            (1 if enabled else 0, family_id),
        )
        family_enabled_changed = True

    # Check for attached route
    route_row = cursor.execute(
        "SELECT id, plan_json FROM route_searches WHERE family_id = ?",
        (family_id,),
    ).fetchone()
    circles = None
    route_search_id = None
    if route_row:
        route_search_id = route_row[0]
        plan_data = json.loads(route_row[1])
        circles = plan_data.get("circles", [])

    added_count = 0
    removed_count = 0
    conflicts = []
    affected_search_ids = set()

    if terms is not None:
        existing_terms = cursor.execute(
            "SELECT id, term, label, enabled, position FROM search_family_terms WHERE family_id = ?",
            (family_id,),
        ).fetchall()
        existing_by_id = {row[0]: row for row in existing_terms}

        kept_term_ids = set()
        new_terms_to_attach = []

        for pos, item in enumerate(terms):
            tid = item.get("id") if isinstance(item, dict) else None
            t_raw = item.get("term", "") if isinstance(item, dict) else str(item)
            lbl = (item.get("label") if isinstance(item, dict) else None) or t_raw
            en = 1 if (item.get("enabled", 1) if isinstance(item, dict) else 1) else 0
            slug = slugify(t_raw)

            if tid and tid in existing_by_id:
                kept_term_ids.add(tid)
                # Update term details
                cursor.execute(
                    "UPDATE search_family_terms SET term = ?, label = ?, enabled = ?, position = ? WHERE id = ?",
                    (slug, lbl, en, pos, tid),
                )
                # Find its searches to recompute enabled
                for (sid,) in cursor.execute(
                    "SELECT search_id FROM search_family_searches WHERE family_id = ? AND term_id = ?",
                    (family_id, tid),
                ).fetchall():
                    affected_search_ids.add(sid)
            else:
                cursor.execute(
                    "INSERT INTO search_family_terms (family_id, term, label, enabled, position) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (family_id, slug, lbl, en, pos),
                )
                new_tid = cursor.lastrowid
                new_terms_to_attach.append({"id": new_tid, "term": slug, "label": lbl})
                added_count += 1

        # Remove terms no longer in payload
        for tid, row in existing_by_id.items():
            if tid not in kept_term_ids:
                sids = [
                    s[0]
                    for s in cursor.execute(
                        "SELECT search_id FROM search_family_searches WHERE family_id = ? AND term_id = ?",
                        (family_id, tid),
                    ).fetchall()
                ]
                affected_search_ids.update(sids)
                cursor.execute(
                    "DELETE FROM search_family_searches WHERE family_id = ? AND term_id = ?",
                    (family_id, tid),
                )
                cursor.execute("DELETE FROM search_family_terms WHERE id = ?", (tid,))
                removed_count += 1

        if new_terms_to_attach:
            new_conflicts = attach_terms(
                conn,
                family_id,
                new_terms_to_attach,
                circles=circles,
                campaign_id=campaign_id,
                knowledge_set_id=knowledge_set_id,
                route_search_id=route_search_id,
            )
            conflicts.extend(new_conflicts)

    if family_enabled_changed:
        for (sid,) in cursor.execute(
            "SELECT DISTINCT search_id FROM search_family_searches WHERE family_id = ?",
            (family_id,),
        ).fetchall():
            affected_search_ids.add(sid)

    recompute_enabled(conn, affected_search_ids)

    total_searches = cursor.execute(
        "SELECT COUNT(DISTINCT search_id) FROM search_family_searches WHERE family_id = ?",
        (family_id,),
    ).fetchone()[0]

    conn.commit()
    return {
        "id": family_id,
        "searches": total_searches,
        "added": added_count,
        "removed": removed_count,
        "conflicts": conflicts,
    }


def delete_family(conn, family_id):
    """Deletes a search family and its ownership references.

    Preserves searches, listings, and hits; recomputes enabled state on all affected searches.
    """
    cursor = conn.cursor()
    affected_searches = [
        row[0]
        for row in cursor.execute(
            "SELECT DISTINCT search_id FROM search_family_searches WHERE family_id = ?",
            (family_id,),
        ).fetchall()
    ]

    cursor.execute(
        "DELETE FROM search_family_searches WHERE family_id = ?", (family_id,)
    )
    cursor.execute("DELETE FROM search_family_terms WHERE family_id = ?", (family_id,))
    cursor.execute(
        "UPDATE route_searches SET family_id = NULL WHERE family_id = ?", (family_id,)
    )
    cursor.execute("DELETE FROM search_families WHERE id = ?", (family_id,))

    recompute_enabled(conn, affected_searches)
    conn.commit()
    return True
