from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from auth import get_current_user

app = FastAPI(title="Chronos API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:8090"],  # Include all necessary origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Welcome to Chronos API"}

@app.get("/api/user")
async def get_user(user = Depends(get_current_user)):
    return {"user": user}

@app.get("/api/protected")
async def protected_route(user = Depends(get_current_user)):
    return {"message": "This is a protected route", "user_id": user.id}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )
