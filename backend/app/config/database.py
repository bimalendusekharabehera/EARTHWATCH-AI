import os
import pyodbc
from dotenv import load_dotenv

load_dotenv()

DB_DRIVER = os.getenv("DB_DRIVER", "ODBC Driver 17 for SQL Server").strip()
DB_SERVER = os.getenv("DB_SERVER", r"localhost\SQLExpress").strip()
DB_DATABASE = os.getenv("DB_DATABASE", "EarthWatchAI").strip()
DB_TRUSTED_CONNECTION = os.getenv("DB_TRUSTED_CONNECTION", "yes").strip()
DB_TRUST_SERVER_CERTIFICATE = os.getenv("DB_TRUST_SERVER_CERTIFICATE", "yes").strip()
DB_USER = os.getenv("DB_USER", "").strip()
DB_PASSWORD = os.getenv("DB_PASSWORD", "").strip()

# Backward-compatible module-level constants
SERVER = DB_SERVER
DATABASE = DB_DATABASE


def build_connection_string() -> str:
    """Build ODBC connection string from environment configuration with local defaults."""
    driver_val = (
        DB_DRIVER
        if DB_DRIVER.startswith("{") and DB_DRIVER.endswith("}")
        else f"{{{DB_DRIVER}}}"
    )
    parts = [
        f"DRIVER={driver_val}",
        f"SERVER={DB_SERVER}",
        f"DATABASE={DB_DATABASE}",
    ]
    if DB_USER and DB_PASSWORD:
        parts.append(f"UID={DB_USER}")
        parts.append(f"PWD={DB_PASSWORD}")
    else:
        parts.append(f"Trusted_Connection={DB_TRUSTED_CONNECTION}")

    parts.append(f"TrustServerCertificate={DB_TRUST_SERVER_CERTIFICATE};")
    return ";".join(parts)


CONNECTION_STRING = build_connection_string()


def get_connection():
    return pyodbc.connect(build_connection_string())