import os
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db_schema


class TestSchemaMigrations(unittest.TestCase):
    def test_apply_migrations_applies_in_order_and_idempotent(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            migrations_dir = os.path.join(tmpdir, "migrations")
            os.makedirs(migrations_dir)

            conn = sqlite3.connect(db_path)
            conn.execute(
                "CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
            )
            conn.commit()

            with open(
                os.path.join(migrations_dir, "001_first.sql"), "w", encoding="utf-8"
            ) as f:
                f.write("CREATE TABLE alpha (id INTEGER PRIMARY KEY);")
            with open(
                os.path.join(migrations_dir, "002_second.sql"), "w", encoding="utf-8"
            ) as f:
                f.write("ALTER TABLE alpha ADD COLUMN description TEXT;")

            applied = db_schema.apply_migrations(conn, migrations_dir=migrations_dir)
            self.assertEqual(applied, ["001_first", "002_second"])
            self.assertEqual(
                db_schema.get_applied_migrations(conn),
                {"001_first", "002_second"},
            )

            # Idempotent re-run
            second_run = db_schema.apply_migrations(conn, migrations_dir=migrations_dir)
            self.assertEqual(second_run, [])

            # Non-existent directory is safe
            empty_run = db_schema.apply_migrations(
                conn, migrations_dir=os.path.join(tmpdir, "nonexistent")
            )
            self.assertEqual(empty_run, [])

            conn.close()


if __name__ == "__main__":
    unittest.main()
