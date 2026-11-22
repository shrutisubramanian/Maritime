import os
import glob
import re

services_dir = r"c:\Users\Shruti Subramanian\OneDrive\Desktop\Maritime\nhaav-frontend\src\services"
files = glob.glob(os.path.join(services_dir, "*.ts"))

for file_path in files:
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    basename = os.path.basename(file_path)
    
    # 1. Handle apiClient.ts: remove /api from default fallback
    if basename == "apiClient.ts":
        content = content.replace("'http://localhost:8000/api'", "'http://localhost:8000'")
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        continue
    
    # 2. Handle api.ts: remove /api
    if basename == "api.ts":
        content = content.replace("'http://localhost:8000/api'", "'http://localhost:8000'")
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        continue

    # 3. For all other files:
    # Remove local API_URL declarations
    content = re.sub(r"const API_URL = import\.meta\.env\.VITE_API_URL.*?;", "", content, flags=re.MULTILINE)
    
    # Replace axios import with apiClient alias
    if "import axios from 'axios';" in content:
        content = content.replace("import axios from 'axios';", "import { apiClient as axios } from './apiClient';")
    else:
        # If it doesn't import axios, just skip
        pass

    # Replace `${API_URL}` with empty string or adjust path.
    # Since apiClient baseURL already has the host, we should change `${API_URL}/endpoint` to `/endpoint`
    content = content.replace("`${API_URL}/", "`/")
    content = content.replace("`${API_URL}", "`")
    
    if basename == "documents.ts":
        # Rename GET /documents to GET /documents/me
        content = content.replace("`/documents`", "`/documents/me`")
        
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

print("Frontend services refactored successfully.")
