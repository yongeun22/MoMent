from __future__ import annotations

from argparse import ArgumentParser
from getpass import getpass
from pathlib import Path

from app.auth import generate_salt, hash_password
from app.config import load_config
from app.database import Database
from app.public_site import export_static_site


def init_admin(username: str, password: str | None) -> int:
    config = load_config()
    database = Database(config.db_path)
    database.initialize()

    if not password:
        password = getpass("New admin password: ")
        confirmation = getpass("Confirm password: ")
        if password != confirmation:
            print("Passwords do not match.")
            return 1

    if len(password) < 8:
        print("Password must be at least 8 characters long.")
        return 1

    salt = generate_salt()
    password_hash = hash_password(password, salt)
    database.create_or_replace_admin(username, password_hash, salt.hex())

    print(f"Admin account '{username}' is ready.")
    return 0


def export_static(output: str | None) -> int:
    config = load_config()
    database = Database(config.db_path)
    database.initialize()

    output_dir = Path(output) if output else config.root_dir / "dist"
    if not output_dir.is_absolute():
        output_dir = config.root_dir / output_dir

    export_static_site(
        root_dir=config.root_dir,
        static_dir=config.static_dir,
        uploads_dir=config.uploads_dir,
        database=database,
        output_dir=output_dir,
    )

    photo_count = len(database.list_photos())
    print(f"Static site exported to '{output_dir}'.")
    print(f"Included {photo_count} photograph(s).")
    return 0


def main() -> int:
    parser = ArgumentParser(description="MoMent management commands")
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_admin_parser = subparsers.add_parser("init-admin", help="Create or replace the single admin account")
    init_admin_parser.add_argument("--username", default="yong1109", help="Admin username")
    init_admin_parser.add_argument("--password", help="Admin password (optional; prompt if omitted)")

    export_static_parser = subparsers.add_parser("export-static", help="Export the public exhibition as a static site")
    export_static_parser.add_argument("--output", help="Output directory (defaults to ./dist)")

    args = parser.parse_args()

    if args.command == "init-admin":
        return init_admin(args.username, args.password)

    if args.command == "export-static":
        return export_static(args.output)

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
