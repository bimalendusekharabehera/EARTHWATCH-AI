import pyodbc

SERVER = r"localhost\SQLExpress"
DATABASE = "EarthWatchAI"

CONNECTION_STRING = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    f"SERVER={SERVER};"
    f"DATABASE={DATABASE};"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
)


def get_connection():
    return pyodbc.connect(CONNECTION_STRING)