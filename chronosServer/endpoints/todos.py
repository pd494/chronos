from fastapi import (
    APIRouter,
    HTTPException,
    Depends,
    status,
    Request
)
from fastapi.responses import JSONResponse
from db.supabase_client import get_supabase_client
from db.auth_dependency import get_current_user
from db.google_credentials import GoogleCalendarService
from supabase import Client
from models.user import User
from models.todo import CategoryUpdate, Todo, Category, BatchCategoryReorder
from uuid import UUID
from models.todo import TodoUpdate

router = APIRouter(prefix="/todos", tags=["Todos"])


@router.post("/")
async def create_todo(
    todo: Todo,
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
) -> JSONResponse:
    
    todo_data = todo.model_dump(exclude={"id"}, mode="json")
    print(f"Todo data: {todo_data}")
    todo_data["user_id"] = str(user.id)
    category_result = (
        supabase.table("categories")
        .select("id")
        .eq("user_id", str(user.id))
        .eq("name", todo.category_name)
        .execute()
    )
    if not category_result.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category not found"
        )
    todo_data["category_id"] = category_result.data[0]["id"]
    result = supabase.table("todos").insert(todo_data).execute()
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create todo"
        )
    
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={
            "message": "Todo created successfully",
            "data": result.data[0]
        },
    )

@router.get("/")
async def get_todos(
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
) -> JSONResponse:
    
    try:
        result = (
            supabase.table("todos")
            .select("*")
            .eq("user_id", str(user.id))
            .execute()
        )
    except Exception as e:
        error_msg = str(e)
        if "JWT expired" in error_msg or "PGRST303" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired. Please refresh.",
                headers={"X-Token-Expired": "true"}
            )
        raise
    
    if not result.data:
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "message": "No todos found",
                "data": []
            }
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "message": "Todos fetched successfully",
            "data": result.data
        },
    )

@router.put("/{todo_id}")
async def edit_todo(
    todo_id: UUID,
    todo_update: TodoUpdate,
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
) -> JSONResponse:
    
    updates = todo_update.model_dump(exclude_unset=True, exclude_none=True)
    
    if "category_id" in updates and updates["category_id"] is not None:
        updates["category_id"] = str(updates["category_id"])
    
    result = (
        supabase.table("todos")
        .update(updates)
        .eq("id", str(todo_id))
        .eq("user_id", str(user.id))
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update todo"
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "message": "Todo updated successfully",
            "data": result.data[0],
        },
    )
    
    
@router.patch("/{todo_id}/complete")
async def complete(
    todo_id: str,
    is_completed: bool = False,
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
) -> JSONResponse:
    
    
    result = (
        supabase.table("todos")
        .update({"completed": is_completed})
        .eq("id", todo_id)
        .eq("user_id", str(user.id))
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Todo not found or access denied"
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "message": "Todo updated successfully",
            "data": result.data[0]
        }
    )


@router.delete("/{todo_id}")
async def delete_todo(
    todo_id: str,
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
) -> JSONResponse:
    
    result = (
        supabase.table("todos")
        .delete()
        .eq("id", todo_id)
        .eq("user_id", str(user.id))
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Todo not found or is not yours"
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "message": "Todo deleted successfully"
        }
    )


# --------- CATEGORIES ENDPOINTS --------------

@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: str,
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
) -> JSONResponse:
    
    todos_result = (
        supabase.table("todos")
        .delete()
        .eq("category_id", category_id)
        .eq("user_id", str(user.id))
        .execute()
    )
    result = (
        supabase.table("categories")
        .delete()
        .eq("id", category_id)
        .eq("user_id", str(user.id))
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found or is not yours"
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "message": "Category and associated todos deleted successfully"
        }
    )
@router.post("/categories/")
async def create_category(
    category: Category, 
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
) -> JSONResponse: 
    
    existing =  (
        supabase.table("categories")
        .select("*")
        .eq("user_id", str(user.id))
        .eq("name", category.name)
        .execute()
    )
    
    if existing.data:
        raise HTTPException(
            status_code = status.HTTP_400_BAD_REQUEST,
            detail = "Category already exists"
        )
    category_data = category.model_dump(mode = "json") 
    category_data["user_id"] = str(user.id)
    result = supabase.table("categories").insert(category_data).execute()
    if not result.data:
        raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST, 
                            detail = "Unable to create category")
    return JSONResponse(
        status_code = status.HTTP_201_CREATED,
        content = {
            "message": "Category created successfully",
            "data": Category(**result.data[0]).model_dump(mode="json"),
        }
    )

@router.get("/categories/")
async def get_categories(
    supabase: Client = Depends(get_supabase_client),   
    user: User = Depends(get_current_user)
) -> JSONResponse:
    
    result = (
        supabase.table("categories")
        .select("*")
        .eq("user_id", str(user.id))
        .execute()
    )
    if not result.data:
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "message": "No categories found",
                "data": []
            }
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "message": "Categories fetched successfully",
            "data": result.data
        },
    )

@router.patch("/categories/batch-reorder")
async def batch_reorder_categories(
    payload: BatchCategoryReorder,
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
) -> JSONResponse:
    updates = payload.updates
    if not updates:
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"updated": 0, "categories": []}
        )

    category_ids = [update.id for update in updates]
    verification = (
        supabase.table("categories")
        .select("*")
        .eq("user_id", str(user.id))
        .in_("id", category_ids)
        .execute()
    )

    if not verification.data or len(verification.data) != len(category_ids):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Some categories do not belong to user"
        )

    existing_categories = {cat["id"]: cat for cat in verification.data}

    rows = [
        {
            "id": update.id,
            "order": update.order,
            "user_id": str(user.id),
            "name": existing_categories[update.id]["name"],
            "color": existing_categories[update.id]["color"]
        }
        for update in updates
    ]

    result = (
        supabase.table("categories")
        .upsert(rows, on_conflict="id")
        .execute()
    )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"updated": len(rows), "categories": result.data or []}
    )

@router.patch("/categories/{category_id}")
async def update_category(
    category_id: str,
    category_update: CategoryUpdate,
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
) -> JSONResponse:
    
    updates = category_update.model_dump(exclude_unset=True, exclude_none=True)
    result = (
        supabase.table("categories")
        .update(updates)
        .eq("id", category_id)
        .eq("user_id", str(user.id))
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update category"
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "message": "Category updated successfully",
            "data": result.data[0]
        }
    )

@router.patch("/categories/{category_id}/assign-todo/{todo_id}")
async def assign_todo_to_category(
    category_id: str,
    todo_id: str,
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
) -> JSONResponse:
    
    result = (
        supabase.table("todos")
        .update({"category_id": category_id})
        .eq("id", todo_id)
        .eq("user_id", str(user.id))
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to assign todo to category"
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "message": "Todo assigned to category successfully",
            "data": result.data[0]
        }
    )


@router.post("/{todo_id}/convert-to-event")
async def convert_todo_to_event(
    todo_id: str,
    request: Request,
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
) -> JSONResponse:
    """
    Convert a todo into a Google Calendar event
    """
    try:
        body = await request.json()
        start_date = body.get("start_date")
        end_date = body.get("end_date")
        is_all_day = body.get("is_all_day", False)
        category_color = body.get("category_color")
        
        if not start_date or not end_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="start_date and end_date are required"
            )
        
        # Fetch the todo
        todo_result = (
            supabase.table("todos")
            .select("*")
            .eq("id", todo_id)
            .eq("user_id", str(user.id))
            .execute()
        )
        
        if not todo_result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Todo not found"
            )
        
        todo = todo_result.data[0]
        
        service = GoogleCalendarService(str(user.id), supabase)
        
        event_data = {
            "summary": todo.get("content", "Untitled Event"),
            "description": f"Converted from todo: {todo.get('content', '')}",
        }
        
        # Store category color in extended properties if provided
        if category_color:
            event_data["extendedProperties"] = {
                "private": {
                    "categoryColor": category_color
                }
            }
            
            # Map hex color to Google Calendar colorId for better display in Google Calendar
            # Google Calendar supports colorIds 1-11
            color_mapping = {
                "#3478F6": "9",  # Blue
                "#FF9500": "6",  # Orange
                "#34C759": "10", # Green
                "#FF3B30": "11", # Red
                "#AF52DE": "3",  # Purple/Lavender
                "#00C7BE": "7",  # Turquoise
                "#FFCC00": "5",  # Yellow
                "#FF2D55": "4",  # Pink
            }
            
            # Find closest colorId if exact match not found
            if category_color in color_mapping:
                event_data["colorId"] = color_mapping[category_color]
            elif category_color.startswith('#'):
                # Default to blue if no mapping found
                event_data["colorId"] = "9"
        
        # Handle all-day vs timed events
        if is_all_day:
            # For all-day events, use date format (not dateTime)
            from datetime import datetime
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            
            event_data["start"] = {
                "date": start_dt.strftime("%Y-%m-%d")
            }
            event_data["end"] = {
                "date": end_dt.strftime("%Y-%m-%d")
            }
        else:
            # For timed events, use dateTime format
            event_data["start"] = {
                "dateTime": start_date,
                "timeZone": "America/Los_Angeles"  # You may want to make this configurable
            }
            event_data["end"] = {
                "dateTime": end_date,
                "timeZone": "America/Los_Angeles"
            }
        
        created_event = service.create_event("primary", event_data)
        
     
        formatted_event = {
            "id": created_event.get("id"),
            "summary": created_event.get("summary"),
            "start": created_event.get("start"),
            "end": created_event.get("end"),
            "calendar_id": "primary"
        }

        try:
            supabase.table("todos").update({
                "date": start_date, 
            }).eq("id", todo_id).eq("user_id", str(user.id)).execute()
        except Exception as update_error:
            import logging
            logging.getLogger(__name__).warning(
                "Failed to persist scheduled date for todo %s: %s", todo_id, update_error
            )
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "message": "Todo converted to event successfully",
                "data": formatted_event
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error converting todo to event: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to convert todo to event: {str(e)}"
        )
    


    
    
