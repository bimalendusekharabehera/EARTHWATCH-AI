from app.config.database import get_connection

try:
    connection = get_connection()

    print("Database connection successful!")

    cursor = connection.cursor()
    cursor.execute("SELECT DB_NAME()")

    database_name = cursor.fetchone()[0]

    print("Connected database:", database_name)

    cursor.close()
    connection.close()

except Exception as error:
    print("Database connection failed!")
    print(error)