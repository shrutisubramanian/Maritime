import uuid
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from jose import jwt, JWTError

from app.database import get_db
from app.models.user import User, UserRole
from app.config import settings

# OAuth2PasswordBearer tells FastAPI how to extract the token from the Authorization header.
# 'tokenUrl' tells the Swagger UI where to send the login request to get the token.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    """
    Base dependency that extracts the JWT token from the request, validates it, 
    and retrieves the corresponding user from the database.
    
    Authentication Flow:
    1. Client sends HTTP request with 'Authorization: Bearer <token>'.
    2. FastAPI automatically extracts the token using OAuth2PasswordBearer.
    3. We decode the token using the secret key and algorithm.
    4. If decoding fails (expired, invalid signature), raise 401 Unauthorized.
    5. Extract the UUID and query the database. If no user, raise 401.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM]
        )

        print("PAYLOAD:", payload)

        user_id_str = payload.get("sub")

        print("USER ID:", user_id_str)

        if user_id_str is None:
            raise credentials_exception

        user_id = uuid.UUID(user_id_str)

    except Exception as e:
        print("AUTH ERROR:", e)
        raise credentials_exception

    # Query the database for the user based on the decoded ID
    user = db.query(User).filter(User.id == user_id).first()
    print("DB USER:", user)
    if user is None:
        raise credentials_exception
        
    return user

def get_current_provider(current_user: User = Depends(get_current_user)) -> User:
    """
    Role-based authorization dependency.
    Requires the user to be fully authenticated AND have the 'provider' role.
    
    Flow:
    1. Runs get_current_user() first to ensure authentication.
    2. Checks if the resulting user's role is 'provider'.
    3. Returns 403 Forbidden if they lack permissions.
    """
    if current_user.role != UserRole.provider:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions. Provider access required."
        )
    return current_user

def get_current_client(current_user: User = Depends(get_current_user)) -> User:
    """
    Role-based authorization dependency.
    Requires the user to be fully authenticated AND have the 'client' role.
    
    Flow:
    1. Runs get_current_user() first to ensure authentication.
    2. Checks if the resulting user's role is 'client'.
    3. Returns 403 Forbidden if they lack permissions.
    """
    if current_user.role != UserRole.client:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions. Client access required."
        )
    return current_user
