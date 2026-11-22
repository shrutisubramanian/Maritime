from sqlalchemy import create_engine, inspect

engine = create_engine("sqlite:///nhaav.db")
inspector = inspect(engine)

print("Tables:", inspector.get_table_names())
for col in inspector.get_columns("documents"):
    print(f"Col: {col['name']}, Type: {col['type']}")
