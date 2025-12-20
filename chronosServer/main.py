from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from endpoints.auth import router as auth_router
from endpoints.todos import router as todo_router
from endpoints.calendar import router as calendar_router
from endpoints.settings import router as settings_router
from endpoints.chat import router as chat_router
from config import settings
import logging

# Configure logging - reduce noise from httpx
logging.basicConfig(level=logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)

app = FastAPI(title="Chronos API")
allowed_origins = sorted(
    {
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    }
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(todo_router)
app.include_router(calendar_router)
app.include_router(settings_router)
app.include_router(chat_router)


@app.get("/")
async def root():
    return {"message": "Welcome to Chronos API"}

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )
