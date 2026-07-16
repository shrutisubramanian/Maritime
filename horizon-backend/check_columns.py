import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect

load_dotenv()

db_url = os.getenv("DATABASE_URL")
engine = create_engine(db_url)
inspector = inspect(engine)

print("Tables:", inspector.get_table_names())
for col in inspector.get_columns("documents"):
    print(f"Col: {col['name']}, Type: {col['type']}")
