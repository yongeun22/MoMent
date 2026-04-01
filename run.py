from app.config import load_config
from app.server import run_server


if __name__ == "__main__":
    run_server(load_config())
