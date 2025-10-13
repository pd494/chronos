from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID, uuid4
from fastapi import Depends

class Category(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    name: str
    color: str  
    order: int

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None  
    order: Optional[int] = None
    
    
class Todo(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    content: str
    completed: bool = False
    date: Optional[datetime] = None
    category_id: Optional[UUID] = None
    category_name: Optional[str] = None
    
class TodoUpdate(BaseModel):
    content: Optional[str] = None
    completed: Optional[bool] = False
    date: Optional[datetime] = None
    order: Optional[int] = None
    category_id: Optional[UUID] = None
    category_name: Optional[str] = None


