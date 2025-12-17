from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID, uuid4

class Category(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    name: str
    color: str  
    order: int

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None  
    order: Optional[int] = None


class CategoryOrderUpdate(BaseModel):
    id: str
    order: int


class BatchCategoryReorder(BaseModel):
    updates: List[CategoryOrderUpdate]
    
class Todo(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    content: str
    completed: bool = False
    date: Optional[datetime] = None
    category_id: Optional[UUID] = None
    category_name: Optional[str] = None
    google_event_id: Optional[str] = None
    scheduled_date: Optional[datetime] = None
    scheduled_at: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    scheduled_is_all_day: Optional[bool] = None
    
    
class TodoUpdate(BaseModel):
    content: Optional[str] = None
    completed: Optional[bool] = None
    date: Optional[datetime] = None
    order: Optional[int] = None
    category_id: Optional[UUID] = None
    category_name: Optional[str] = None
    google_event_id: Optional[str] = None
    scheduled_date: Optional[datetime] = None
    scheduled_at: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    scheduled_is_all_day: Optional[bool] = None
