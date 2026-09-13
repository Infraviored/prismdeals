"""Applies db/schema.sql to a database.

Deliberately holds no schema of its own. It reads the same file the Node side
reads, because two declarations of one table drift: route_searches was declared
in both runtimes, and the campaign dashboard returned 500 on every fresh install
because Node queried a table only this side knew how to create.

Idempotent: every statement in the file is IF NOT EXISTS, so this can run on
every connection and costs nothing on a database that is already correct.
"""

import os
import sqlite3

SCHEMA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "db", "schema.sql"
)
MIGRATIONS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "db", "migrations"
)

# Applying the schema per connection is cheap but not free, and some callers
# open a connection per listing. One pass per database file per process is
# enough: the file cannot become un-applied while we hold it.
_APPLIED = set()


def apply_schema(connection, force=False):
    """Bring `connection`'s database up to db/schema.sql.

    Also switches foreign keys on, which SQLite requires per connection and
    which is therefore forgotten roughly every time. A cascade that has never
    cascaded is worse than no cascade, because the code reads as if it works.
    """
    connection.execute("PRAGMA foreign_keys = ON")

    key = _database_key(connection)
    if not force and key is not None and key in _APPLIED:
        return

    with open(SCHEMA_PATH, encoding="utf-8") as handle:
        script = handle.read()

    # Statement at a time rather than executescript, because SQLite has no
    # ADD COLUMN IF NOT EXISTS and executescript would abandon the rest of the
    # file at the first column that already exists -- which is every startup
    # after the first.
    for statement in _statements(script):
        try:
            connection.execute(statement)
        except sqlite3.OperationalError as error:
            if "duplicate column name" not in str(error).lower():
                raise RuntimeError(
                    f"Applying db/schema.sql failed on:\n{statement}\n\n{error}"
                ) from error
    connection.commit()

    # Apply incremental migrations if db/migrations exists
    apply_migrations(connection)

    if key is not None:
        _APPLIED.add(key)


def get_applied_migrations(connection) -> set:
    """Return set of migration version names that have been recorded in schema_migrations."""
    try:
        cursor = connection.execute("SELECT version FROM schema_migrations")
        return {row[0] for row in cursor.fetchall()}
    except sqlite3.OperationalError:
        # Table does not exist yet
        return set()


def record_migration(connection, version: str):
    """Record that a migration version has been applied."""
    connection.execute(
        "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)",
        (version,),
    )
    connection.commit()


def apply_migrations(connection, migrations_dir=MIGRATIONS_DIR) -> list:
    """Apply any pending .sql migrations from migrations_dir in sorted order."""
    if not os.path.isdir(migrations_dir):
        return []

    applied = get_applied_migrations(connection)
    applied_now = []

    migration_files = sorted(
        f for f in os.listdir(migrations_dir) if f.endswith(".sql")
    )
    for filename in migration_files:
        version = os.path.splitext(filename)[0]
        if version in applied:
            continue
        filepath = os.path.join(migrations_dir, filename)
        with open(filepath, encoding="utf-8") as handle:
            script = handle.read()
        with connection:
            for statement in _statements(script):
                connection.execute(statement)
            connection.execute(
                "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)",
                (version,),
            )
        applied_now.append(version)

    return applied_now


def _statements(script):
    """Split the schema file into statements.

    Naive on purpose: this is plain DDL with no triggers, so no statement body
    contains a semicolon. If that ever changes, it breaks here and loudly.
    """
    for chunk in script.split(";"):
        statement = "\n".join(
            line for line in chunk.splitlines() if not line.strip().startswith("--")
        ).strip()
        if statement:
            yield statement


def _database_key(connection):
    """The file this connection is attached to, or None for in-memory."""
    try:
        for _, name, path in connection.execute("PRAGMA database_list"):
            if name == "main":
                return path or None
    except sqlite3.Error:
        return None
    return None


def connect(path, **kwargs):
    """Open a database that is guaranteed to match the schema."""
    connection = sqlite3.connect(path, **kwargs)
    apply_schema(connection)
    return connection


def reset_cache():
    """Forget which databases have been brought up to date. For tests."""
    _APPLIED.clear()


def default_path():
    """Which database this process should open.

    `PRISMDEALS_DB` is honoured here for the same reason it is honoured by the
    backend: the two sides must agree on which file they mean. They did not, and
    it cost twice in one evening. First `backend/db_setup.js` ignored the
    variable and deleted the production database while being pointed at a
    temporary one. Then, with that fixed, `scraper/main.py` still ignored it —
    so a route replanned "against a copy" was replanned against production.

    An environment variable that some processes obey and others quietly do not
    is worse than one nobody obeys: it reads as a safety measure while being
    none.
    """
    override = os.environ.get("PRISMDEALS_DB")
    if override:
        return override
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "data",
        "scraper.db",
    )
